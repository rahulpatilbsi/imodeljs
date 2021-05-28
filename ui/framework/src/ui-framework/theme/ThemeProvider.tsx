/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { ThemeType } from "@itwin/itwinui-react";

import "@itwin/itwinui-css/css/global.css";

/**
 * Hook that applies styling and theme to all components.
 * Defaults to light theme if none provided or set elsewhere.
 * @param theme Light, dark, or based on OS setting.
 */
export const useTheme = (theme?: ThemeType, ownerDocument = document): void => {
  React.useLayoutEffect(() => {
    if (!ownerDocument.body.classList.contains("iui-body")) {
      ownerDocument.body.classList.add("iui-body");
    }
  }, [ownerDocument]);

  React.useLayoutEffect(() => {
    switch (theme) {
      case "light":
        addLightTheme(ownerDocument);
        break;
      case "dark":
        addDarkTheme(ownerDocument);
        break;
      case "os":
        if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
          addDarkTheme(ownerDocument);
        } else {
          addLightTheme(ownerDocument);
        }
        break;
      default:
        if (!ownerDocument.documentElement.classList.value.includes("iui-theme")) {
          addLightTheme(ownerDocument);
        }
    }
  }, [theme, ownerDocument]);
};

const addLightTheme = (ownerDocument: Document) => {
  ownerDocument.documentElement.classList.add("iui-theme-light");
  ownerDocument.documentElement.classList.remove("iui-theme-dark");
};

const addDarkTheme = (ownerDocument: Document) => {
  ownerDocument.documentElement.classList.add("iui-theme-dark");
  ownerDocument.documentElement.classList.remove("iui-theme-light");
};

/** @internal */
export interface ThemeProviderProps {
  /**
   * Theme to be applied. If not set, light theme will be used.
   */
  theme?: ThemeType;
  /**
   * Optional children.
   */
  children?: React.ReactNode;
  ownerDocument?: Document;
}

/**
 * Component providing global styles that are required for all components and allows changing theme.
 */
export function ThemeProvider({ theme, children, ownerDocument }: ThemeProviderProps) {
  useTheme(theme, ownerDocument);
  return <>{children}</>;
}
