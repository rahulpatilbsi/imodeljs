/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { GuidString } from "@bentley/bentleyjs-core";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { HubUtility } from "./HubUtility";

/** Name of the Context the test iModels will be created or expected to already exist.
 *
 * Note: See the
 */
export const contextName = "iModelJsIntegrationTest";

/** Manages all of the iModels used to run the integration tests */
export class TestIModels {
  public static noVersions: string = "NoVersionsTest";
  public static stadium: string = "Stadium Dataset 1";
  public static readOnly: string = "ReadOnlyTest";
  public static readWrite: string = "ReadWriteTest";
}

const contextId: GuidString | undefined = undefined;

/** Returns the ContextId if a Context with the name exists. Otherwise, returns undefined. */
export async function getTestContextId(requestContext: AuthorizedClientRequestContext): Promise<GuidString> {
  requestContext.enter();
  if (undefined !== contextId)
    return contextId;
  return await HubUtility.queryProjectIdByName(requestContext, contextName);
}

const imodelCache = new Map<string, GuidString>();
/** Returns the iModelId if the iModel exists. Otherwise, returns undefined. */
export async function getTestIModelId(requestContext: AuthorizedClientRequestContext, name: string): Promise<GuidString> {
  requestContext.enter();
  if (imodelCache.has(name))
    return imodelCache.get(name)!;

  const projectId = await getTestContextId(requestContext);
  requestContext.enter();

  const imodelId = await HubUtility.queryIModelIdByName(requestContext, projectId, name);
  requestContext.enter();

  imodelCache.set(name, imodelId);
  return imodelId;
}
