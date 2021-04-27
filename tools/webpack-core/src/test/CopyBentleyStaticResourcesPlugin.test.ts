/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as path from "path";
import * as webpack from "webpack";
import * as fs from "fs-extra";
import { resetPaths, updatePaths } from "../utils/paths";
import { createCompiler, getTestConfig } from "./TestUtils";
import { CopyBentleyStaticResourcesPlugin } from "../plugins/CopyBentleyStaticResourcesPlugin";

describe("CopyBentleyStaticResourcesPlugin", () => {
  it("success with inability to find directory path", async () => {
    updatePaths(path.join(__dirname, "assets/copy-resources-test"));
    const successTestConfig = getTestConfig("assets/copy-resources-test/copyResourcesTest.js", new CopyBentleyStaticResourcesPlugin(["assets"]));
    const sucessTestCompiler = createCompiler(webpack, successTestConfig);
    const result = await new Promise<any>((resolve, reject) => {
      sucessTestCompiler.run((err: any, stats: any) => (err) ? reject(err) : resolve(stats));
    });

    const logging = result.toJson({ logging: true }).logging;
    expect(logging, "Log message should not contain CopyBentleyStaticResourcesPlugin").to.not.have.property("CopyBentleyStaticResourcesPlugin");

    const testModulePath = path.join(__dirname, "dist/assets/copyResourceTestFile.js");
    expect(fs.existsSync(testModulePath), "copyResourceTestFile.js should be copied to /dist").to.be.true;
  });

  it("failure with inability to find directory path", async () => {
    updatePaths(__dirname);
    const failTestConfig = getTestConfig("assets/empty-test/empty.js", new CopyBentleyStaticResourcesPlugin(["assets"]));
    const failTestCompiler = createCompiler(webpack, failTestConfig);
    const result = await new Promise<any>((resolve, reject) => {
      failTestCompiler.run((err: any, stats: any) => (err) ? reject(err) : resolve(stats));
    });

    const entry = result.toJson({ logging: true }).logging.CopyBentleyStaticResourcesPlugin.entries[0];

    expect(entry.type, "Type is not an error").to.equal("error");
    expect(entry.message, `Message should start with Can't locate`).to.include(`Can't locate`);
  });

  afterEach(() => {
    resetPaths();
  });
});
