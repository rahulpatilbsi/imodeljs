/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { LabelDefinition, Node, NodeKey, PageOptions as PresentationPageOptions } from "@bentley/presentation-common";
import { PropertyRecord } from "@bentley/ui-abstract";
import { DelayLoadedTreeNodeItem, ItemColorOverrides, ItemStyle, PageOptions as UiPageOptions } from "@bentley/ui-components";
import { CheckBoxState } from "@bentley/ui-core";
import { StyleHelper } from "../common/StyleHelper";
import { createLabelRecord } from "../common/Utils";

/** @internal */
export const PRESENTATION_TREE_NODE_KEY = "__presentation-components/key";

/** @internal */
export interface CreateTreeNodeItemProps {
  appendChildrenCountForGroupingNodes?: boolean;
}

/** @internal */
export const createTreeNodeItems = (nodes: ReadonlyArray<Readonly<Node>>, parentId?: string, props?: CreateTreeNodeItemProps): DelayLoadedTreeNodeItem[] => {
  const list = new Array<DelayLoadedTreeNodeItem>();
  for (const node of nodes)
    list.push(createTreeNodeItem(node, parentId, props));
  return list;
};

/** @internal */
export const createTreeNodeItem = (node: Readonly<Node>, parentId?: string, props?: CreateTreeNodeItemProps): DelayLoadedTreeNodeItem => {
  const item: DelayLoadedTreeNodeItem = {
    id: [...node.key.pathFromRoot].reverse().join("/"),
    label: createNodeLabelRecord(node, !!props?.appendChildrenCountForGroupingNodes),
  };
  (item as any)[PRESENTATION_TREE_NODE_KEY] = node.key;

  const style: ItemStyle = {};
  const colorOverrides: ItemColorOverrides = {};
  if (parentId)
    item.parentId = parentId;
  if (node.description)
    item.description = node.description;
  if (node.hasChildren)
    item.hasChildren = true;
  if (node.isExpanded)
    item.autoExpand = true;
  if (node.imageId)
    item.icon = node.imageId;
  if (StyleHelper.isBold(node))
    style.isBold = true;
  if (StyleHelper.isItalic(node))
    style.isItalic = true;
  const foreColor = StyleHelper.getForeColor(node);
  if (foreColor)
    colorOverrides.color = foreColor;
  const backColor = StyleHelper.getBackColor(node);
  if (backColor)
    colorOverrides.backgroundColor = backColor;
  if (node.isCheckboxVisible) {
    item.isCheckboxVisible = true;
    if (node.isChecked)
      item.checkBoxState = CheckBoxState.On;
    if (!node.isCheckboxEnabled)
      item.isCheckboxDisabled = true;
  }
  if (Object.keys(colorOverrides).length > 0)
    style.colorOverrides = colorOverrides;
  if (Object.keys(style).length > 0)
    item.style = style;
  if (node.extendedData)
    item.extendedData = node.extendedData;

  return item;
};

/** @internal */
export const pageOptionsUiToPresentation = (pageOptions?: UiPageOptions): PresentationPageOptions | undefined => {
  if (pageOptions)
    return { ...pageOptions };
  return undefined;
};

const createNodeLabelRecord = (node: Node, appendChildrenCountForGroupingNodes: boolean): PropertyRecord => {
  let labelDefinition = node.label;
  if (appendChildrenCountForGroupingNodes && NodeKey.isGroupingNodeKey(node.key)) {
    const countDefinition: LabelDefinition = {
      displayValue: `(${node.key.groupedInstancesCount})`,
      rawValue: `(${node.key.groupedInstancesCount})`,
      typeName: "string",
    };
    labelDefinition = {
      displayValue: `${labelDefinition.displayValue} ${countDefinition.displayValue}`,
      rawValue: {
        separator: " ",
        values: [
          labelDefinition,
          countDefinition,
        ],
      },
      typeName: LabelDefinition.COMPOSITE_DEFINITION_TYPENAME,
    };
  }
  return createLabelRecord(labelDefinition, "node_label");
};
