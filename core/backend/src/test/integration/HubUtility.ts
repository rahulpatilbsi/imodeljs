/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import {
  assert, BeDuration, BentleyStatus, ChangeSetApplyOption, ChangeSetStatus, Guid, GuidString, Logger, OpenMode, PerfLogger,
} from "@bentley/bentleyjs-core";
import { ContextRegistryClient, Project } from "@bentley/context-registry-client";
import {
  Briefcase, BriefcaseQuery, ChangeSet, ChangeSetQuery, ChangesType, Checkpoint, CheckpointQuery, HubIModel, IModelBaseHandler, IModelHubClient,
  IModelQuery, InitializationState, Version, VersionQuery,
} from "@bentley/imodelhub-client";
import { BriefcaseIdValue } from "@bentley/imodeljs-common";
import { IModelJsNative } from "@bentley/imodeljs-native";
import { AuthorizedClientRequestContext, ECJsonTypeMap, WsgInstance } from "@bentley/itwin-client";
import { IModelDb, IModelHost, IModelJsFs } from "../../imodeljs-backend";

/** DTO to work with iModelHub DeleteChangeSet API */
@ECJsonTypeMap.classToJson("wsg", "iModelActions.DeleteChangeSet", { schemaPropertyName: "schemaName", classPropertyName: "className" })
class DeleteChangeSetAction extends WsgInstance {
  @ECJsonTypeMap.propertyToJson("wsg", "instanceId")
  public id?: GuidString;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.ChangeSetId")
  public changeSetId?: GuidString;

  @ECJsonTypeMap.propertyToJson("wsg", "properties.State")
  public state?: number;
}

/** Enum to work with iModelHub Actions API */
enum ActionState {
  Completed = 2
}

/** Utility to work with test iModels in the iModelHub */
export class HubUtility {
  public static logCategory = "HubUtility";

  public static testContextName = "iModelJsIntegrationTest";
  public static testIModelNames = {
    noVersions: "NoVersionsTest",
    stadium: "Stadium Dataset 1",
    readOnly: "ReadOnlyTest",
    readWrite: "ReadWriteTest",
  };

  private static contextId: GuidString | undefined = undefined;
  /** Returns the ContextId if a Context with the name exists. Otherwise, returns undefined. */
  public static async getTestContextId(requestContext: AuthorizedClientRequestContext): Promise<GuidString> {
    requestContext.enter();
    if (undefined !== HubUtility.contextId)
      return HubUtility.contextId;
    return HubUtility.queryProjectIdByName(requestContext, HubUtility.testContextName);
  }

  private static imodelCache = new Map<string, GuidString>();
  /** Returns the iModelId if the iModel exists. Otherwise, returns undefined. */
  public static async getTestIModelId(requestContext: AuthorizedClientRequestContext, name: string): Promise<GuidString> {
    requestContext.enter();
    if (HubUtility.imodelCache.has(name))
      return HubUtility.imodelCache.get(name)!;

    const projectId = await HubUtility.getTestContextId(requestContext);
    requestContext.enter();

    const imodelId = await HubUtility.queryIModelIdByName(requestContext, projectId, name);
    requestContext.enter();

    HubUtility.imodelCache.set(name, imodelId);
    return imodelId;
  }

  private static async queryProjectByName(requestContext: AuthorizedClientRequestContext, projectName: string): Promise<Project | undefined> {
    const project = await getIModelProjectAbstraction().queryProject(requestContext, {
      $select: "*",
      $filter: `Name+eq+'${projectName}'`,
    });
    return project;
  }

  public static async queryIModelByName(requestContext: AuthorizedClientRequestContext, projectId: string, iModelName: string): Promise<HubIModel | undefined> {
    const iModels = await getIModelProjectAbstraction().queryIModels(requestContext, projectId, new IModelQuery().byName(iModelName));
    if (iModels.length === 0)
      return undefined;
    if (iModels.length > 1)
      throw new Error(`Too many iModels with name ${iModelName} found`);
    return iModels[0];
  }

  private static async queryIModelById(requestContext: AuthorizedClientRequestContext, projectId: string, iModelId: GuidString): Promise<HubIModel | undefined> {
    const iModels = await getIModelProjectAbstraction().queryIModels(requestContext, projectId, new IModelQuery().byId(iModelId));
    if (iModels.length === 0)
      return undefined;
    return iModels[0];
  }

  /**
   * Queries the project id by its name
   * @param requestContext The client request context
   * @param projectName Name of project
   * @throws If the project is not found, or there is more than one project with the supplied name
   */
  public static async queryProjectIdByName(requestContext: AuthorizedClientRequestContext, projectName: string): Promise<string> {
    const project = await HubUtility.queryProjectByName(requestContext, projectName);
    if (!project)
      throw new Error(`Project ${projectName} not found`);
    return project.wsgId;
  }

  /**
   * Queries the iModel id by its name
   * @param requestContext The client request context
   * @param projectId Id of the project
   * @param iModelName Name of the iModel
   * @throws If the iModel is not found, or if there is more than one iModel with the supplied name
   */
  public static async queryIModelIdByName(requestContext: AuthorizedClientRequestContext, projectId: GuidString, iModelName: string): Promise<GuidString> {
    const iModel = await HubUtility.queryIModelByName(requestContext, projectId, iModelName);
    if (!iModel || !iModel.id)
      throw new Error(`IModel ${iModelName} not found`);
    return iModel.id;
  }

  /** Query the latest change set (id) of the specified iModel */
  public static async queryLatestChangeSet(requestContext: AuthorizedClientRequestContext, iModelId: GuidString): Promise<ChangeSet | undefined> {
    const changeSets = await IModelHost.iModelClient.changeSets.get(requestContext, iModelId, new ChangeSetQuery().top(1).latest());
    return (changeSets.length === 0) ? undefined : changeSets[changeSets.length - 1];
  }

  /** Download all change sets of the specified iModel */
  private static async downloadChangeSets(requestContext: AuthorizedClientRequestContext, changeSetsPath: string, _projectId: GuidString, iModelId: GuidString): Promise<ChangeSet[]> {
    // Determine the range of changesets that remain to be downloaded
    const changeSets = await IModelHost.iModelClient.changeSets.get(requestContext, iModelId, new ChangeSetQuery()); // oldest to newest
    if (changeSets.length === 0)
      return changeSets;
    const latestIndex = changeSets.length - 1;
    let earliestIndex = 0; // Earliest index that doesn't exist
    while (earliestIndex <= latestIndex) {
      const pathname = path.join(changeSetsPath, changeSets[earliestIndex].fileName!);
      if (!IModelJsFs.existsSync(pathname))
        break;
      ++earliestIndex;
    }
    if (earliestIndex > latestIndex) // All change sets have already been downloaded
      return changeSets;

    const earliestChangeSetId = earliestIndex > 0 ? changeSets[earliestIndex - 1].id! : undefined; // Query results exclude earliest specified change set
    const latestChangeSetId = changeSets[latestIndex].id!; // Query results include latest specified change set
    const query = earliestChangeSetId ? new ChangeSetQuery().betweenChangeSets(earliestChangeSetId, latestChangeSetId) : new ChangeSetQuery();

    const perfLogger = new PerfLogger("HubUtility.downloadChangeSets -> Download ChangeSets");
    await IModelHost.iModelClient.changeSets.download(requestContext, iModelId, query, changeSetsPath);
    perfLogger.dispose();
    return changeSets;
  }

  /** Download all named versions of the specified iModel */
  private static async downloadNamedVersions(requestContext: AuthorizedClientRequestContext, _projectId: string, iModelId: GuidString): Promise<Version[]> {
    const query = new VersionQuery();
    query.orderBy("createdDate");

    const perfLogger = new PerfLogger("HubUtility.downloadNamedVersions -> Get Version Infos");
    const versions = await IModelHost.iModelClient.versions.get(requestContext, iModelId, query);
    perfLogger.dispose();
    if (versions.length === 0)
      return new Array<ChangeSet>();
    return versions;
  }

  /** Download an IModel's seed files and change sets from the Hub.
   *  A standard hierarchy of folders is created below the supplied downloadDir
   */
  public static async downloadIModelById(requestContext: AuthorizedClientRequestContext, projectId: string, iModelId: GuidString, downloadDir: string, reDownload: boolean): Promise<void> {
    // Recreate the download folder if necessary
    if (reDownload) {
      if (IModelJsFs.existsSync(downloadDir))
        IModelJsFs.purgeDirSync(downloadDir);
      IModelJsFs.recursiveMkDirSync(downloadDir);
    }

    const iModel = await HubUtility.queryIModelById(requestContext, projectId, iModelId);
    if (!iModel)
      throw new Error(`IModel with id ${iModelId} not found`);

    // Write the JSON representing the iModel
    const iModelJsonStr = JSON.stringify(iModel, undefined, 4);
    const iModelJsonPathname = path.join(downloadDir, "imodel.json");
    IModelJsFs.writeFileSync(iModelJsonPathname, iModelJsonStr);

    // Download the seed file
    const seedPathname = path.join(downloadDir, "seed", iModel.name!.concat(".bim"));
    if (!IModelJsFs.existsSync(seedPathname)) {
      const perfLogger = new PerfLogger("HubUtility.downloadIModelById -> Download Seed File");
      await IModelHost.iModelClient.iModels.download(requestContext, iModelId, seedPathname);
      perfLogger.dispose();
    }

    // Download the change sets
    const changeSetDir = path.join(downloadDir, "changeSets//");
    const changeSets = await HubUtility.downloadChangeSets(requestContext, changeSetDir, projectId, iModelId);

    const changeSetsJsonStr = JSON.stringify(changeSets, undefined, 4);
    const changeSetsJsonPathname = path.join(downloadDir, "changeSets.json");
    IModelJsFs.writeFileSync(changeSetsJsonPathname, changeSetsJsonStr);

    // Download the version information
    const namedVersions = await HubUtility.downloadNamedVersions(requestContext, projectId, iModelId);
    const namedVersionsJsonStr = JSON.stringify(namedVersions, undefined, 4);
    const namedVersionsJsonPathname = path.join(downloadDir, "namedVersions.json");
    IModelJsFs.writeFileSync(namedVersionsJsonPathname, namedVersionsJsonStr);
  }

  /** Download an IModel's seed files and change sets from the Hub.
   *  A standard hierarchy of folders is created below the supplied downloadDir
   */
  public static async downloadIModelByName(requestContext: AuthorizedClientRequestContext, projectName: string, iModelName: string, downloadDir: string, reDownload: boolean): Promise<void> {
    const projectId = await HubUtility.queryProjectIdByName(requestContext, projectName);

    const iModel = await HubUtility.queryIModelByName(requestContext, projectId, iModelName);
    if (!iModel)
      throw new Error(`IModel ${iModelName} not found`);
    const iModelId = iModel.id!;

    await HubUtility.downloadIModelById(requestContext, projectId, iModelId, downloadDir, reDownload);
  }

  /** Delete an IModel from the hub */
  public static async deleteIModel(requestContext: AuthorizedClientRequestContext, projectName: string, iModelName: string): Promise<void> {
    const projectId = await HubUtility.queryProjectIdByName(requestContext, projectName);
    const iModelId = await HubUtility.queryIModelIdByName(requestContext, projectId, iModelName);

    await IModelHost.iModelClient.iModels.delete(requestContext, projectId, iModelId);
  }

  /** Get the pathname of the briefcase in the supplied directory - assumes a standard layout of the supplied directory */
  public static getBriefcasePathname(iModelDir: string): string {
    const seedPathname = HubUtility.getSeedPathname(iModelDir);
    return path.join(iModelDir, path.basename(seedPathname));
  }

  /** Apply change set with Merge operation on an iModel on disk - the supplied directory contains a sub folder
   * with the seed files, change sets, etc. in a standard format.
   * Returns time taken for each changeset. Returns on first apply changeset error.
   */
  public static getApplyChangeSetTime(iModelDir: string, startCS: number = 0, endCS: number = 0): any[] {
    const briefcasePathname = HubUtility.getBriefcasePathname(iModelDir);

    Logger.logInfo(HubUtility.logCategory, "Making a local copy of the seed");
    HubUtility.copyIModelFromSeed(briefcasePathname, iModelDir, true /* =overwrite */);

    const nativeDb = new IModelHost.platform.DgnDb();
    nativeDb.openIModel(briefcasePathname, OpenMode.ReadWrite);
    const changeSets = HubUtility.readChangeSets(iModelDir);
    const endNum: number = endCS ? endCS : changeSets.length;
    const filteredCS = changeSets.filter((obj) => obj.index! >= startCS && obj.index! <= endNum);

    Logger.logInfo(HubUtility.logCategory, "Merging all available change sets");
    const applyOption = ChangeSetApplyOption.Merge;
    const perfLogger = new PerfLogger(`Applying change sets for operation ${ChangeSetApplyOption[applyOption]}`);

    const results = [];
    // Apply change sets one by one to debug any issues
    for (const changeSet of filteredCS) {
      const startTime = new Date().getTime();
      let csResult = ChangeSetStatus.Success;
      try {
        nativeDb.applyChangeSet(changeSet, applyOption);
      } catch (err) {
        csResult = err.errorNumber;
      }
      const endTime = new Date().getTime();
      const elapsedTime = (endTime - startTime) / 1000.0;
      results.push({
        csNum: changeSet.index,
        csId: changeSet.id,
        csApplyOption: ChangeSetApplyOption[applyOption],
        csResult,
        time: elapsedTime,
      });
    }

    perfLogger.dispose();
    nativeDb.closeIModel();

    return results;
  }

  /** Validate apply with briefcase on disk */
  public static validateApplyChangeSetsOnDisk(iModelDir: string) {
    const briefcasePathname = HubUtility.getBriefcasePathname(iModelDir);

    Logger.logInfo(HubUtility.logCategory, "Making a local copy of the seed");
    HubUtility.copyIModelFromSeed(briefcasePathname, iModelDir, false /* =overwrite */);

    const nativeDb = new IModelHost.platform.DgnDb();
    nativeDb.openIModel(briefcasePathname, OpenMode.ReadWrite);
    const lastAppliedChangeSetId = nativeDb.getParentChangeSetId();
    assert(!nativeDb.getReversedChangeSetId());

    const changeSets = HubUtility.readChangeSets(iModelDir);
    const lastMergedChangeSet = changeSets.find((value) => value.id === lastAppliedChangeSetId);
    const filteredChangeSets = lastMergedChangeSet ? changeSets.filter((value) => value.index! > lastMergedChangeSet.index!) : changeSets;

    // Logger.logInfo(HubUtility.logCategory, "Dumping all available change sets");
    // HubUtility.dumpChangeSetsToLog(iModel, changeSets);

    Logger.logInfo(HubUtility.logCategory, "Merging all available change sets");
    const status: ChangeSetStatus = HubUtility.applyChangeSetsToNativeDb(nativeDb, filteredChangeSets, ChangeSetApplyOption.Merge);

    nativeDb.closeIModel();
    assert(status === ChangeSetStatus.Success, "Error applying change sets");
  }

  /** Validate all change set operations on an iModel on disk - the supplied directory contains a sub folder
   * with the seed files, change sets, etc. in a standard format. This tests merging the change sets, reversing them,
   * and finally reinstating them. The method also logs the necessary performance
   * metrics with these operations
   */
  public static validateAllChangeSetOperationsOnDisk(iModelDir: string) {
    const briefcasePathname = HubUtility.getBriefcasePathname(iModelDir);

    Logger.logInfo(HubUtility.logCategory, "Making a local copy of the seed");
    HubUtility.copyIModelFromSeed(briefcasePathname, iModelDir, true /* =overwrite */);

    const nativeDb = new IModelHost.platform.DgnDb();
    nativeDb.openIModel(briefcasePathname, OpenMode.ReadWrite);
    const changeSets = HubUtility.readChangeSets(iModelDir);

    let status: ChangeSetStatus;

    // Logger.logInfo(HubUtility.logCategory, "Dumping all available change sets");
    // HubUtility.dumpChangeSetsToLog(iModel, changeSets);

    Logger.logInfo(HubUtility.logCategory, "Merging all available change sets");
    status = HubUtility.applyChangeSetsToNativeDb(nativeDb, changeSets, ChangeSetApplyOption.Merge);

    // Reverse changes until there's a schema change set (note that schema change sets cannot be reversed)
    const reverseChangeSets = changeSets.reverse();
    const schemaChangeIndex = reverseChangeSets.findIndex((token) => token.changesType === ChangesType.Schema);
    const filteredChangeSets = reverseChangeSets.slice(0, schemaChangeIndex); // exclusive of element at schemaChangeIndex
    if (status === ChangeSetStatus.Success) {
      Logger.logInfo(HubUtility.logCategory, "Reversing all available change sets");
      status = HubUtility.applyChangeSetsToNativeDb(nativeDb, filteredChangeSets, ChangeSetApplyOption.Reverse);
    }

    if (status === ChangeSetStatus.Success) {
      Logger.logInfo(HubUtility.logCategory, "Reinstating all available change sets");
      filteredChangeSets.reverse();
      status = HubUtility.applyChangeSetsToNativeDb(nativeDb, filteredChangeSets, ChangeSetApplyOption.Reinstate);
    }

    nativeDb.closeIModel();
    assert(status === ChangeSetStatus.Success, "Error applying change sets");
  }

  /** Validate all change set operations by downloading seed files & change sets, creating a standalone iModel,
   * merging the change sets, reversing them, and finally reinstating them. The method also logs the necessary performance
   * metrics with these operations.
   */
  public static async validateAllChangeSetOperations(requestContext: AuthorizedClientRequestContext, projectId: string, iModelId: GuidString, iModelDir: string) {
    Logger.logInfo(HubUtility.logCategory, "Downloading seed file and all available change sets");
    await HubUtility.downloadIModelById(requestContext, projectId, iModelId, iModelDir, true /* =reDownload */);

    this.validateAllChangeSetOperationsOnDisk(iModelDir);
  }

  private static getSeedPathname(iModelDir: string) {
    const seedFileDir = path.join(iModelDir, "seed");
    const seedFileNames = IModelJsFs.readdirSync(seedFileDir);
    if (seedFileNames.length !== 1) {
      throw new Error(`Expected to find one and only one seed file in: ${seedFileDir}`);
    }
    const seedFileName = seedFileNames[0];
    const seedPathname = path.join(seedFileDir, seedFileName);
    return seedPathname;
  }

  /** Push an iModel to the Hub */
  public static async pushIModel(requestContext: AuthorizedClientRequestContext, projectId: string, pathname: string, iModelName?: string, overwrite?: boolean): Promise<GuidString> {
    // Delete any existing iModels with the same name as the required iModel
    const locIModelName = iModelName || path.basename(pathname, ".bim");
    let iModel = await HubUtility.queryIModelByName(requestContext, projectId, locIModelName);
    if (iModel) {
      if (!overwrite)
        return iModel.id!;
      await IModelHost.iModelClient.iModels.delete(requestContext, projectId, iModel.id!);
    }

    // Upload a new iModel
    iModel = await IModelHost.iModelClient.iModels.create(requestContext, projectId, locIModelName, { path: pathname });
    return iModel.id!;
  }

  /** Upload an IModel's seed files and change sets to the hub
   * It's assumed that the uploadDir contains a standard hierarchy of seed files and change sets.
   */
  public static async pushIModelAndChangeSets(requestContext: AuthorizedClientRequestContext, projectName: string, uploadDir: string, iModelName?: string, overwrite?: boolean): Promise<GuidString> {
    const projectId = await HubUtility.queryProjectIdByName(requestContext, projectName);
    const seedPathname = HubUtility.getSeedPathname(uploadDir);
    const iModelId = await HubUtility.pushIModel(requestContext, projectId, seedPathname, iModelName, overwrite);

    let briefcase: Briefcase;
    const hubBriefcases = await IModelHost.iModelClient.briefcases.get(requestContext, iModelId);
    if (hubBriefcases.length > 0)
      briefcase = hubBriefcases[0];
    else
      briefcase = await IModelHost.iModelClient.briefcases.create(requestContext, iModelId);
    if (!briefcase) {
      throw new Error(`Could not acquire a briefcase for the iModel ${iModelId}`);
    }
    briefcase.iModelId = iModelId;

    await HubUtility.pushChangeSets(requestContext, briefcase, uploadDir);
    await HubUtility.pushNamedVersions(requestContext, briefcase, uploadDir, overwrite);
    return iModelId;
  }

  private static async pushChangeSets(requestContext: AuthorizedClientRequestContext, briefcase: Briefcase, uploadDir: string): Promise<void> {
    const changeSetJsonPathname = path.join(uploadDir, "changeSets.json");
    if (!IModelJsFs.existsSync(changeSetJsonPathname))
      return;

    const jsonStr = IModelJsFs.readFileSync(changeSetJsonPathname) as string;
    const changeSetsJson = JSON.parse(jsonStr);

    // Find the last change set that was already uploaded
    const lastUploadedChangeSet = await HubUtility.queryLatestChangeSet(requestContext, briefcase.iModelId!);
    const lastIndex = lastUploadedChangeSet ? changeSetsJson.findIndex((changeSetJson: any) => changeSetJson.id === lastUploadedChangeSet.id) : -1;
    const filteredChangeSetsJson = lastUploadedChangeSet ? changeSetsJson.slice(lastIndex + 1) : changeSetsJson;

    // Upload change sets
    const count = filteredChangeSetsJson.length;
    let ii = 0;
    for (const changeSetJson of filteredChangeSetsJson) {
      const changeSetPathname = path.join(uploadDir, "changeSets", changeSetJson.fileName);
      if (!IModelJsFs.existsSync(changeSetPathname)) {
        throw new Error(`Cannot find the ChangeSet file: ${changeSetPathname}`);
      }

      const changeSet = new ChangeSet();
      changeSet.id = changeSetJson.id;
      changeSet.parentId = changeSetJson.parentId;
      changeSet.fileSize = changeSetJson.fileSize;
      changeSet.changesType = changeSetJson.changesType;
      changeSet.briefcaseId = briefcase.briefcaseId;

      await IModelHost.iModelClient.changeSets.create(requestContext, briefcase.iModelId!, changeSet, changeSetPathname);
      ii++;
      Logger.logInfo(HubUtility.logCategory, `Uploaded Change Set ${ii} of ${count}`, () => ({ ...changeSet }));
    }
  }

  private static async pushNamedVersions(requestContext: AuthorizedClientRequestContext, briefcase: Briefcase, uploadDir: string, overwrite?: boolean): Promise<void> {
    const namedVersionsJsonPathname = path.join(uploadDir, "namedVersions.json");
    if (!IModelJsFs.existsSync(namedVersionsJsonPathname))
      return;

    const jsonStr = IModelJsFs.readFileSync(namedVersionsJsonPathname) as string;
    const namedVersionsJson = JSON.parse(jsonStr);

    for (const namedVersionJson of namedVersionsJson) {
      const query = (new VersionQuery()).byChangeSet(namedVersionJson.changeSetId);

      const versions = await IModelHost.iModelClient.versions.get(requestContext, briefcase.iModelId!, query);
      if (versions.length > 0 && !overwrite)
        continue;
      await IModelHost.iModelClient.versions.create(requestContext, briefcase.iModelId!, namedVersionJson.changeSetId, namedVersionJson.name, namedVersionJson.description);
    }
  }

  /**
   * Purges all acquired briefcases for the specified iModel (and user), if the specified threshold of acquired briefcases is exceeded
   */
  public static async purgeAcquiredBriefcasesById(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, onReachThreshold: () => void = () => { }, acquireThreshold: number = 16): Promise<void> {
    const briefcases = await IModelHost.iModelClient.briefcases.get(requestContext, iModelId, new BriefcaseQuery().ownedByMe());
    if (briefcases.length > acquireThreshold) {
      if (undefined !== onReachThreshold)
        onReachThreshold();

      const promises = new Array<Promise<void>>();
      briefcases.forEach((briefcase) => {
        promises.push(IModelHost.iModelClient.briefcases.delete(requestContext, iModelId, briefcase.briefcaseId!));
      });
      await Promise.all(promises);
    }
  }

  /**
   * Purges all acquired briefcases for the specified iModel (and user), if the specified threshold of acquired briefcases is exceeded
   */
  public static async purgeAcquiredBriefcases(requestContext: AuthorizedClientRequestContext, projectName: string, iModelName: string, acquireThreshold: number = 16): Promise<void> {
    const projectId = await HubUtility.queryProjectIdByName(requestContext, projectName);
    const iModelId = await HubUtility.queryIModelIdByName(requestContext, projectId, iModelName);

    return this.purgeAcquiredBriefcasesById(requestContext, iModelId, () => {
      Logger.logInfo(HubUtility.logCategory, `Reached limit of maximum number of briefcases for ${projectName}:${iModelName}. Purging all briefcases.`);
    }, acquireThreshold);
  }

  /** Reads change sets from disk and expects a standard structure of how the folder is organized */
  public static readChangeSets(iModelDir: string): IModelJsNative.ChangeSetProps[] {
    const tokens: IModelJsNative.ChangeSetProps[] = [];

    const changeSetJsonPathname = path.join(iModelDir, "changeSets.json");
    if (!IModelJsFs.existsSync(changeSetJsonPathname))
      return tokens;

    const jsonStr = IModelJsFs.readFileSync(changeSetJsonPathname) as string;
    const changeSetsJson = JSON.parse(jsonStr);

    for (const changeSetJson of changeSetsJson) {
      const pathname = path.join(iModelDir, "changeSets", changeSetJson.fileName);
      if (!IModelJsFs.existsSync(pathname))
        throw new Error(`Cannot find the ChangeSet file: ${pathname}`);
      tokens.push({ id: changeSetJson.id, parentId: changeSetJson.parentId, pathname, index: + changeSetJson.index, changesType: changeSetJson.changesType });
    }
    return tokens;
  }

  /** Creates a standalone iModel from the seed file (version 0) */
  private static copyIModelFromSeed(iModelPathname: string, iModelDir: string, overwrite: boolean) {
    const seedPathname = HubUtility.getSeedPathname(iModelDir);

    if (!IModelJsFs.existsSync(iModelPathname)) {
      IModelJsFs.copySync(seedPathname, iModelPathname);
    } else if (overwrite) {
      IModelJsFs.unlinkSync(iModelPathname);
      IModelJsFs.copySync(seedPathname, iModelPathname);
    }

    const nativeDb = new IModelHost.platform.DgnDb();
    nativeDb.openIModel(iModelPathname, OpenMode.ReadWrite);
    nativeDb.deleteAllTxns();
    nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);
    if (nativeDb.queryLocalValue("StandaloneEdit"))
      nativeDb.deleteLocalValue("StandaloneEdit");
    nativeDb.saveChanges();
    nativeDb.closeIModel();

    return iModelPathname;
  }

  /** Applies change sets one by one (for debugging) */
  public static applyChangeSetsToNativeDb(nativeDb: IModelJsNative.DgnDb, changeSets: IModelJsNative.ChangeSetProps[], applyOption: ChangeSetApplyOption): ChangeSetStatus {
    const perfLogger = new PerfLogger(`Applying change sets for operation ${ChangeSetApplyOption[applyOption]}`);

    // Apply change sets one by one to debug any issues
    let count = 0;
    for (const changeSet of changeSets) {
      ++count;
      Logger.logInfo(HubUtility.logCategory, `Started applying change set: ${count} of ${changeSets.length} (${new Date(Date.now()).toString()})`, () => ({ ...changeSet }));
      try {
        nativeDb.applyChangeSet(changeSet, applyOption);
        Logger.logInfo(HubUtility.logCategory, "Successfully applied ChangeSet", () => ({ ...changeSet, status }));
      } catch (err) {
        Logger.logError(HubUtility.logCategory, `Error applying ChangeSet ${err.errorNumber}`, () => ({ ...changeSet }));
        perfLogger.dispose();
        return err.errorNumber;
      }
    }

    perfLogger.dispose();
    return ChangeSetStatus.Success;
  }

  public static dumpChangeSet(iModel: IModelDb, changeSet: IModelJsNative.ChangeSetProps) {
    iModel.nativeDb.dumpChangeSet(changeSet);
  }

  /** Dumps change sets to the log */
  public static dumpChangeSetsToLog(iModelDb: IModelDb, changeSets: IModelJsNative.ChangeSetProps[]) {
    let count = 0;
    changeSets.forEach((changeSet) => {
      count++;
      Logger.logInfo(HubUtility.logCategory, `Dumping change set: ${count} of ${changeSets.length}`, () => ({ ...changeSet }));
      HubUtility.dumpChangeSet(iModelDb, changeSet);
    });
  }

  /** Dumps change sets to Db */
  public static dumpChangeSetsToDb(changeSetDbPathname: string, changeSets: IModelJsNative.ChangeSetProps[], dumpColumns: boolean = true) {
    let count = 0;
    changeSets.forEach((changeSet) => {
      count++;
      Logger.logInfo(HubUtility.logCategory, `Dumping change set: ${count} of ${changeSets.length}`, () => ({ ...changeSet }));
      HubUtility.dumpChangeSetToDb(changeSet.pathname, changeSetDbPathname, dumpColumns);
    });
  }

  public static dumpChangeSetToDb(changeSetPathname: string, changeSetDbPathname: string, dumpColumns: boolean = true): BentleyStatus {
    if (!IModelJsFs.existsSync(changeSetPathname))
      throw new Error("Changeset file does not exists");
    return IModelHost.platform.RevisionUtility.dumpChangesetToDb(changeSetPathname, changeSetDbPathname, dumpColumns);
  }

  /** Generate a name (for an iModel) that's unique for the user + host */
  public static generateUniqueName(baseName: string) {
    return `${baseName} - ${Guid.createValue()}`;
  }

  /** Deletes and re-creates an iModel with the provided name in the Context.
   * @returns the iModelId of the newly created iModel.
  */
  public static async recreateIModel(requestContext: AuthorizedClientRequestContext, contextId: GuidString, iModelName: string): Promise<GuidString> {
    const deleteIModel = await HubUtility.queryIModelByName(requestContext, contextId, iModelName);
    if (undefined !== deleteIModel)
      await IModelHost.iModelClient.iModels.delete(requestContext, contextId, deleteIModel.wsgId);

    // Create a new iModel
    const iModel = await IModelHost.iModelClient.iModels.create(requestContext, contextId, iModelName, { description: `Description for ${iModelName}` });
    return iModel.wsgId;
  }

  /** Create an iModel with the name provided if it does not already exist. If it does exist, the iModelId is returned. */
  public static async createIModel(requestContext: AuthorizedClientRequestContext, contextId: GuidString, iModelName: string): Promise<GuidString> {
    let iModel = await HubUtility.queryIModelByName(requestContext, contextId, iModelName);
    if (!iModel)
      iModel = await IModelHost.iModelClient.iModels.create(requestContext, contextId, iModelName, { description: `Description for iModel` });
    return iModel.wsgId;
  }

  /** Delete a changeSet with a specific index */
  public static async deleteChangeSet(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, changeSetIndex: number): Promise<DeleteChangeSetAction> {
    const invalidChangeSet = (await IModelHost.iModelClient.changeSets.get(requestContext, iModelId, new ChangeSetQuery().filter(`Index+eq+${changeSetIndex}`)))[0];
    const deleteChangeSetActionInstance = new DeleteChangeSetAction();
    deleteChangeSetActionInstance.changeSetId = invalidChangeSet.id;

    const iModelBaseHandler = new IModelBaseHandler();
    const relativePostActionUrl = `/Repositories/iModel--${iModelId}/iModelActions/DeleteChangeSet`;
    return iModelBaseHandler.postInstance(requestContext, DeleteChangeSetAction, relativePostActionUrl, deleteChangeSetActionInstance);
  }

  /** Wait until the specified delete changeSet action completes successfully */
  public static async waitForChangeSetDeletion(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, deleteChangeSetActionId: GuidString): Promise<void> {
    const iModelBaseHandler = new IModelBaseHandler();
    const relativeGetActionUrl = `/Repositories/iModel--${iModelId}/iModelActions/DeleteChangeSet/${deleteChangeSetActionId}`;
    return HubUtility.waitForEntityToReachState(
      async () => (await iModelBaseHandler.getInstances(requestContext, DeleteChangeSetAction, relativeGetActionUrl))[0],
      (action: DeleteChangeSetAction) => action.state === ActionState.Completed);
  }

  /** Wait until the checkpoint for the specified changeSet fails to generate */
  public static async waitforCheckpointGenerationFailure(requestContext: AuthorizedClientRequestContext, iModelId: GuidString, changeSetId: GuidString): Promise<void> {
    return HubUtility.waitForEntityToReachState(
      async () => (await IModelHost.iModelClient.checkpoints.get(requestContext, iModelId, new CheckpointQuery().byChangeSetId(changeSetId)))[0],
      (checkpoint: Checkpoint) => checkpoint.state === InitializationState.Failed);
  }

  private static async waitForEntityToReachState<T>(entityQuery: () => Promise<T>, conditionToSatisfy: (entity: T) => Boolean): Promise<void> {
    for (let i = 0; i < 60; i++) {
      const currentEntity = await entityQuery();
      if (!currentEntity)
        throw new Error("Queried entity is undefined.");

      if (conditionToSatisfy(currentEntity))
        return;

      await BeDuration.wait(10000);
    }

    throw new Error("Entity did not reach the expected state in 10 minutes.");
  }
}

/** An implementation of IModelProjectAbstraction backed by an iTwin project */
class TestIModelHubProject {
  public get isIModelHub(): boolean { return true; }
  public terminate(): void { }

  public get iModelHubClient(): IModelHubClient {
    return IModelHost.iModelClient as IModelHubClient;
  }

  private static _contextRegistryClient?: ContextRegistryClient;

  private static get connectClient(): ContextRegistryClient {
    if (this._contextRegistryClient === undefined)
      this._contextRegistryClient = new ContextRegistryClient();
    return this._contextRegistryClient;
  }

  public async queryProject(requestContext: AuthorizedClientRequestContext, query: any | undefined): Promise<Project> {
    const client = TestIModelHubProject.connectClient;
    return client.getProject(requestContext, query);
  }

  public async createIModel(requestContext: AuthorizedClientRequestContext, projectId: string, params: any): Promise<HubIModel> {
    const client = this.iModelHubClient;
    return client.iModels.create(requestContext, projectId, params.name, { path: params.seedFile, description: params.description, progressCallback: params.tracker });
  }
  public async deleteIModel(requestContext: AuthorizedClientRequestContext, projectId: string, iModelId: GuidString): Promise<void> {
    const client = this.iModelHubClient;
    return client.iModels.delete(requestContext, projectId, iModelId);
  }
  public async queryIModels(requestContext: AuthorizedClientRequestContext, projectId: string, query: IModelQuery | undefined): Promise<HubIModel[]> {
    const client = this.iModelHubClient;
    return client.iModels.get(requestContext, projectId, query);
  }
}

let projectAbstraction: any;
let authorizationAbstraction: any;
const usingMocks = false;

export function getIModelPermissionAbstraction(): any {
  if (authorizationAbstraction !== undefined)
    return authorizationAbstraction;

  if ((process.env.IMODELJS_CLIENTS_TEST_IMODEL_BANK === undefined) || usingMocks) {
    return authorizationAbstraction = {};
  }

  throw new Error("WIP");
}

export function getIModelProjectAbstraction(): any {
  if (projectAbstraction !== undefined)
    return projectAbstraction;

  if ((process.env.IMODELJS_CLIENTS_TEST_IMODEL_BANK === undefined) || usingMocks) {
    return projectAbstraction = new TestIModelHubProject();
  }

  throw new Error("WIP");
}
