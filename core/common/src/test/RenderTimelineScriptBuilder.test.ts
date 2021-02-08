/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { TransformProps } from "@bentley/geometry-core";
import { RenderTimelineScriptBuilder, TimelineBuilder } from "../RenderTimelineScriptBuilder";
import { CuttingPlaneProps, InterpolationType, RenderTimelineScriptProps, TransformComponentProps } from "../RenderTimelineProps";

function addVisibility(builder: TimelineBuilder, value: number, time: number, interpolation = InterpolationType.Linear): void {
  builder.addVisibilityEntry({ value, time, interpolation });
}

function addColor(builder: TimelineBuilder, red: number, green: number, blue: number, time: number, interpolation = InterpolationType.Linear): void {
  builder.addColorEntry({ time, interpolation, value: { red, green, blue } });
}

function addTransform(builder: TimelineBuilder, value: TransformProps | TransformComponentProps, time: number, interpolation = InterpolationType.Linear): void {
  builder.addTransformEntry({ time, interpolation, value });
}

function addCuttingPlane(builder: TimelineBuilder, value: CuttingPlaneProps, time: number, interpolation = InterpolationType.Linear): void {
  builder.addCuttingPlaneEntry({ time, interpolation, value });
}

describe("RenderTimelineScriptBuilder", () => {
  it("allocates unique batch Ids across model and element timelines", () => {
    const script = new RenderTimelineScriptBuilder();
    const modelA = script.addModelTimeline("0xa");
    const modelB = script.addModelTimeline("0xb");
    const groupA = modelA.addElementGroup({ ids: "+1" });
    const groupB = modelB.addElementGroup({ ids: "+2" });

    modelA.addElementTimeline(groupA);
    modelB.addElementTimeline(groupB);
    modelB.addElementTimeline(groupB);
    modelA.addElementTimeline(groupA);

    expect(script.finish()).to.deep.equal([{
      modelId: "0xa",
      elementGroups: [{ ids: "+1" }],
      elementTimelines: [
        { batchId: 1, elementIds: 0 },
        { batchId: 4, elementIds: 0 },
      ],
    }, {
      modelId: "0xb",
      elementGroups: [{ ids: "+2" }],
      elementTimelines: [
        { batchId: 2, elementIds: 0 },
        { batchId: 3, elementIds: 0 },
      ],
    }]);
  });

  it("prohibits multiple timelines for same model", () => {
    const builder = new RenderTimelineScriptBuilder();
    builder.addModelTimeline("0x123");
    expect(() => builder.addModelTimeline("0x123")).to.throw(Error);
  });

  it("rejects invalid model Id", () => {
    const builder = new RenderTimelineScriptBuilder();
    for (const invalidId of [ "0", "abc", "123" ])
      expect(() => builder.addModelTimeline(invalidId)).to.throw(Error);
  });

  it("rejects invalid element group Id", () => {
    const builder = new RenderTimelineScriptBuilder().addModelTimeline("0x123");
    expect(() => builder.addElementTimeline(-1)).to.throw(Error);
    expect(() => builder.addElementTimeline(0)).to.throw(Error);
    builder.addElementGroup({ ids: "+5" });
    builder.addElementTimeline(0);
    expect(() => builder.addElementTimeline(1)).to.throw(Error);
    expect(() => builder.addElementTimeline(0.5)).to.throw(Error);
  });

  it("builds expected JSON", () => {
    const script = new RenderTimelineScriptBuilder();
    const expectedJSON: RenderTimelineScriptProps = [];
    expect(script.finish()).to.deep.equal(expectedJSON);

    const modelA = script.addModelTimeline("0xa");
    addVisibility(modelA, 50, 0, InterpolationType.Step);
    addVisibility(modelA, 25, 100, InterpolationType.Step);
    addColor(modelA, 25, 0, 250, 0);
    addColor(modelA, 0, 25, 225, 100);

    expectedJSON.push({
      modelId: "0xa",
      elementTimelines: [],
      elementGroups: [],
      visibilityTimeline: [
        { value: 50, time: 0, interpolation: 1 },
        { value: 25, time: 100, interpolation: 1 },
      ],
      colorTimeline: [
        { value: { red: 25, green: 0, blue: 250 }, time: 0, interpolation: 2 },
        { value: {red: 0, green: 25, blue: 225 }, time: 100, interpolation: 2 },
      ],
    });
    expect(script.finish()).to.deep.equal(expectedJSON);

    const groupA0 = modelA.addElementGroup({ ids: "+1", includeDescendants: true });
    const elemA0 = modelA.addElementTimeline(groupA0);
    addTransform(elemA0, { pivot: [ 1, 2, 3 ], orientation: [ -1, 2.5, 0.5, 1 ], position: [ 4, 5, 6 ] }, 0, InterpolationType.Step);
    addTransform(elemA0, { pivot: { x: 1, y: 2, z: 3 }, orientation: [ 1, 2, 3, 4 ], position: { x: 4, y: 5, z: 6 } }, 100, InterpolationType.Step);

    expectedJSON[0].elementGroups = [ { ids: "+1", includeDescendants: true } ];
    expectedJSON[0].elementTimelines = [{
      batchId: 1,
      elementIds: 0,
      transformTimeline: [
        { time: 0, interpolation: 1, value: { pivot: [ 1, 2, 3 ], orientation: [ -1, 2.5, 0.5, 1 ], position: [ 4, 5, 6 ] } },
        { time: 100, interpolation: 1, value: { pivot: { x: 1, y: 2, z: 3 }, orientation: [ 1, 2, 3, 4 ], position: { x: 4, y: 5, z: 6 } } },
      ],
    }];
    expect(script.finish()).to.deep.equal(expectedJSON);

    const groupA1 = modelA.addElementGroup({ ids: "+2" });
    const elemA1 = modelA.addElementTimeline(groupA1);
    addCuttingPlane(elemA1, { position: [ 1, 2, 3 ], direction: [ 4, 5, 6 ] }, 0);
    addCuttingPlane(elemA1, { position: { x: 1, y: 2, z: 3 }, direction: { x: 4, y: 5, z: 6 }, visible: true }, 50);
    addCuttingPlane(elemA1, { position: [ 1, 2, 3 ], direction: [ 4, 5, 6 ], hidden: false }, 100);

    expectedJSON[0].elementGroups.push({ ids: "+2" });
    expectedJSON[0].elementTimelines.push({
      batchId: 2,
      elementIds: 1,
      cuttingPlaneTimeline: [
        { time: 0, interpolation: 2, value: { position: [ 1, 2, 3 ], direction: [ 4, 5, 6 ] } },
        { time: 50, interpolation: 2, value: { position: { x: 1, y: 2, z: 3 }, direction: { x: 4, y: 5, z: 6 }, visible: true } },
        { time: 100, interpolation: 2, value: { position: [ 1, 2, 3 ], direction: [ 4, 5, 6 ], hidden: false } },
      ],
    });
    expect(script.finish()).to.deep.equal(expectedJSON);

    const modelB = script.addModelTimeline("0xb");
    addTransform(modelB, [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ], 0);
    addTransform(modelB, [ [ 0, 1, 2, 3 ], [ 4, 5, 6, 7 ], [ 8, 9, 10, 11 ] ], 50);
    addTransform(modelB, { origin: [ 3, 7, 11 ], matrix: [ 0, 1, 2, 4, 5, 6, 8, 9, 10 ] }, 100);

    const groupB0 = modelB.addElementGroup({ ids: "+3", includeDescendants: false });
    const elemB0 = modelB.addElementTimeline(groupB0);
    addVisibility(elemB0, 10, 0);

    expectedJSON.push({
      modelId: "0xb",
      elementGroups: [ { ids: "+3", includeDescendants: false } ],
      transformTimeline: [
        { time: 0, interpolation: 2, value: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ] },
        { time: 50, interpolation: 2, value: [ [ 0, 1, 2, 3 ], [ 4, 5, 6, 7 ], [ 8, 9, 10, 11 ] ] },
        { time: 100, interpolation: 2, value: { origin: [ 3, 7, 11 ], matrix: [ 0, 1, 2, 4, 5, 6, 8, 9, 10 ] } },
      ],
      elementTimelines: [{
        batchId: 3,
        elementIds: 0,
        visibilityTimeline: [
          { time: 0, interpolation: 2, value: 10 },
        ],
      }],
    });
    expect(script.finish()).to.deep.equal(expectedJSON);
  });
});
