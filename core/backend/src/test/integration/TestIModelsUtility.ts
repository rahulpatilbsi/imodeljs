/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { GuidString } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { HubUtility } from "./HubUtility";

/** Name of the Project all of the test iModels will be created or expected at.
 *
 * Note: See the
 */
export const projectName = "iModelJsIntegrationTest";

/** Manages all of the iModels used to run the integration tests */
export class TestiModels {
  public static noVersions: string = "NoVersionsTest";
  public static stadium: string = "Stadium Dataset 1";
  public static readOnly: string = "ReadOnlyTest";
  public static readWrite: string = "ReadWriteTest";
}

const projectId: GuidString | undefined = undefined;

/** Returns the ContextId if a Context with the name exists. Otherwise, returns undefined. */
export async function getTestProjectId(requestContext: AuthorizedClientRequestContext): Promise<GuidString> {
  requestContext.enter();
  if (undefined !== projectId)
    return projectId;
  return await HubUtility.queryProjectIdByName(requestContext, projectName);
}

const imodelCache = new Map<string, GuidString>();
/** Returns the iModelId if the iModel exists. Otherwise, returns undefined. */
export async function getTestiModelId(requestContext: AuthorizedClientRequestContext, name: string): Promise<GuidString> {
  requestContext.enter();
  if (imodelCache.has(name))
    return imodelCache.get(name)!;

  const projectId = await getTestProjectId(requestContext);
  requestContext.enter();

  const imodelId = await HubUtility.queryIModelIdByName(requestContext, projectId, name);
  requestContext.enter();

  imodelCache.set(name, imodelId);
  return imodelId;
}
