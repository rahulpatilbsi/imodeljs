/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { Range3d, Transform } from "@bentley/geometry-core";
import { ViewFlagOverrides } from "@bentley/imodeljs-common";
import { compareIdentifiers } from "semver";
import {  HitDetail, IModelConnection, RenderSystem, TileParams, TileTreeParams, Viewport } from "../../imodeljs-frontend";
// import { DrawingViewState, FeatureSymbology, GeometricModel2dState, HitDetail, IModelConnection, RenderSystem, Tile, TileContent, TileDrawArgs, TileLoadPriority, TileRequest, TileRequestChannel, TileTree, TileTreeOwner, TileTreeSupplier, Viewport, ViewState2d } from "../../imodeljs-frontend";
import { DisclosedTileTreeSet, Tile, TileContent, TiledGraphicsProvider, TileDrawArgs, TileLoadPriority, TileRequest, TileRequestChannel, TileTree, TileTreeOwner, TileTreeReference, TileTreeSupplier } from "../internal";

export class EsriFeatureState {
  public readonly iModel: IModelConnection;
  public readonly id: Id64String;

  public constructor(iModel: IModelConnection) {
    this.iModel = iModel;
    this.id = iModel.transientIds.next;
  }
}

/*
interface EsriFeatureTreeParams {
  tree: TileTree;
  ref: TileTreeReference;
  view: ViewState2d;
  state: EsriFeatureState;
}*/

interface EsriFeatureTreeId {
  state: EsriFeatureState;
}

class EsriFeatureTile extends Tile {
  public constructor(tree: EsriFeatureTree, range: Range3d) {
    super({ contentId: "", range, maximumSize: 512, isLeaf: true }, tree);
    this.setIsReady();
  }

  public get hasChildren() { return false; }
  public get hasGraphics() { return true; }

  public get channel(): TileRequestChannel { throw new Error("tile has no content"); }
  public async requestContent(_isCanceled: () => boolean): Promise<TileRequest.Response> { return undefined; }
  public async readContent(_data: TileRequest.ResponseData, _system: RenderSystem, _isCanceled?: () => boolean): Promise<TileContent> { return {}; }
  protected _loadChildren(_resolve: (children: Tile[]) => void, _reject: (error: Error) => void): void { }

  public drawGraphics(args: TileDrawArgs) {
    console.log(args.tree.is2d);
    /*
    const esriFeatureTree = this.tree as EsriFeatureTree;
    const sectionTree = esriFeatureTree.tree;

    const location = esriFeatureTree.iModelTransform.multiplyTransformTransform(sectionTree.iModelTransform);
    const clipVolume = true === esriFeatureTree.viewFlagOverrides.clipVolumeOverride ? esriFeatureTree.clipVolume : undefined;
    args = new TileDrawArgs({ context: args.context,
      location,
      tree: sectionTree,
      now: args.now,
      viewFlagOverrides: esriFeatureTree.viewFlagOverrides,
      clipVolume,
      parentsAndChildrenExclusive: args.parentsAndChildrenExclusive,
      symbologyOverrides: esriFeatureTree.symbologyOverrides,
    });
    sectionTree.draw(args);*/
  }
}

class EsriFeatureTree extends TileTree {
  private readonly _rootTile: EsriFeatureTile;
  private _tileParams: TileParams;
  public viewFlagOverrides = new ViewFlagOverrides();

  public constructor(treeParams: TileTreeParams, range: Range3d) {
    super(treeParams);
    this._tileParams = { contentId: "0", range, maximumSize: 256 };
    this._rootTile = new EsriFeatureTile(this, range);
  }

  public get rootTile(): EsriFeatureTile { return this._rootTile; }

  public get is3d() { return false; }
  public get isContentUnbounded() { return false; }
  public get maxDepth() { return 1; }

  protected get isDisplayed() { return true; }

  public draw(args: TileDrawArgs): void {
    if (!this.isDisplayed)
      return;

    const tiles = this.selectTiles(args);
    for (const tile of tiles)
      tile.drawGraphics(args);

    args.drawGraphics();
  }

  protected _selectTiles(_args: TileDrawArgs): Tile[] {
    return this.isDisplayed ? [this.rootTile] : [];
  }

  public prune(): void {

  }
}

class EsriFeatureTreeSupplier implements TileTreeSupplier {
  public compareTileTreeIds(lhs: EsriFeatureTreeId, rhs: EsriFeatureTreeId): number {
    const cmp = compareIdentifiers(lhs.state.id, rhs.state.id);

    return cmp;
  }

  public async createTileTree(id: EsriFeatureTreeId, iModel: IModelConnection): Promise<TileTree | undefined> {

    const range = iModel.projectExtents;

    return new EsriFeatureTree({ id: id.state.id, modelId:iModel.transientIds.next, iModel, location:Transform.identity, priority: TileLoadPriority.Context}, range);

  }
}

const esriFeatureTreeSupplier = new EsriFeatureTreeSupplier();

class EsriFeatureTreeRef extends TileTreeReference {
  private readonly _owner: TileTreeOwner;

  public constructor(id: EsriFeatureTreeId) {
    super();
    this._owner = id.state.iModel.tiles.getTileTreeOwner(id, esriFeatureTreeSupplier);
  }

  public get castsShadows() {
    return false;
  }

  public get treeOwner() {
    return this._owner;
  }

  public discloseTileTrees(trees: DisclosedTileTreeSet): void {
    super.discloseTileTrees(trees);

  }

  public async getToolTip(hit: HitDetail) {
    return  super.getToolTip(hit);
  }
}

/** Draws the 2d section graphics into the 3d view. */
export class EsriFeatureProvider implements TiledGraphicsProvider {
  private readonly _treeRef: EsriFeatureTreeRef;

  public constructor(state: EsriFeatureState) {
    this._treeRef = new EsriFeatureTreeRef({state});
  }

  public forEachTileTreeRef(_viewport: Viewport, func: (ref: TileTreeReference) => void): void {
    func(this._treeRef);
  }
}
