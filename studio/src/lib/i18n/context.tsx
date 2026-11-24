"use client";
import React, { createContext, useContext } from "react";
import { DICTS, type Dict, type Locale } from "./dict";

const Ctx = createContext<{ locale: Locale; t: Dict }>({ locale: "nl", t: DICTS.nl });
export const I18nProvider: React.FC<{ locale: Locale; children: React.ReactNode }> = ({ locale, children }) => <Ctx.Provider value={{ locale, t: DICTS[locale] }}>{children}</Ctx.Provider>;
export const useT = () => useContext(Ctx);
