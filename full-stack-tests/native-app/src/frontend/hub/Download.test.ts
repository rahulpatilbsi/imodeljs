/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { BeDuration, GuidString, StopWatch } from "@bentley/bentleyjs-core";
import { ElectronApp } from "@bentley/electron-manager/lib/ElectronFrontend";
import { IModelVersion, SyncMode } from "@bentley/imodeljs-common";
import { BriefcaseConnection, NativeApp } from "@bentley/imodeljs-frontend";
import { ProgressInfo } from "@bentley/itwin-client";
import { usingOfflineScope } from "../HttpRequestHook";
import { NativeAppTest } from "../NativeAppTest";
import { timeLog } from "console";

describe("NativeApp Download (#integration)", () => {
  let testProjectId: GuidString;

  before(async () => {
    await ElectronApp.startup({
      iModelApp: {
        applicationId: "1234",
        applicationVersion: "testappversion",
        sessionId: "testsessionid",
      },
    });

    testProjectId = await NativeAppTest.initializeTestProject();
  });

  after(async () => ElectronApp.shutdown());

  it("Download Briefcase with progress events (#integration)", async () => {
    let events = 0;
    let loaded = 0;
    let total = 0;
    const locTestIModelId = await NativeAppTest.getTestIModelId(testProjectId, "CodesPushTest");
    const downloader = await NativeApp.requestDownloadBriefcase(testProjectId, locTestIModelId, { syncMode: SyncMode.PullOnly }, IModelVersion.latest(),
      (progress: ProgressInfo) => {
        assert.isNumber(progress.loaded);
        assert.isNumber(progress.total);
        assert.isTrue(progress.loaded >= loaded);
        assert.isTrue(progress.total! >= progress.loaded);
        loaded = progress.loaded;
        total = progress.total!;
        events++;
      });

    assert(loaded >= total);
    await downloader.downloadPromise;
    assert.notEqual(events, 0);

    await usingOfflineScope(async () => {
      const rs = await NativeApp.getCachedBriefcases(locTestIModelId);
      assert(rs.length > 0);
      const connection = await BriefcaseConnection.openFile({ fileName: downloader.fileName });
      const rowCount = await connection.queryRowCount("SELECT ECInstanceId FROM bis.Element LIMIT 1");
      assert.notEqual(rowCount, 0);
      await connection.close();
      await NativeApp.deleteBriefcase(downloader.fileName);
    });
  });

  it.only("Should be able to cancel download (#integration)", async () => {
    const locTestIModelId = await NativeAppTest.getTestIModelId(testProjectId, "Stadium Dataset 1");
    console.log("request");

    const watch = new StopWatch("", true);

    const cancelCalled = false;
    const requestVal = false;
    let downloadAborted = false;
    let events = 0;
    let loaded = 0;
    const calls: string[] = [];
    const downloader = await NativeApp.requestDownloadBriefcase(testProjectId, locTestIModelId, { syncMode: SyncMode.PullOnly }, IModelVersion.latest(),
      (progress: ProgressInfo) => {
        assert.isNumber(progress.loaded);
        assert.isNumber(progress.total);
        assert.isTrue(progress.loaded >= loaded);
        assert.isTrue(progress.total! >= progress.loaded);
        loaded = progress.loaded;
        events++;
        calls.push(`progress ${progress.loaded} ${progress.total} elapsed = ${watch.elapsedSeconds}`);
      });
    console.log("requested");

    try {
      console.log("waiting ", watch.elapsedSeconds);
      await downloader.downloadPromise;
      console.log("done download ", watch.elapsedSeconds);
    } catch (err) {
      downloadAborted = true;
    }
    console.log("after wait ", watch.elapsedSeconds);
    console.log("calls = ", calls);
    await NativeApp.deleteBriefcase(downloader.fileName);
    assert.isTrue(events !== 0);
    assert.isTrue(cancelCalled, "cancel should be called");
    assert.isTrue(requestVal, "cancelRequest should succeed");
    assert.isTrue(downloadAborted, "download should abort");
  });

});
