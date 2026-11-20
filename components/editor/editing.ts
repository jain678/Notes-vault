"use client";

import { createContext, useContext } from "react";

/** Whether the note is in edit mode; node views switch their chrome on it. */
export const EditingContext = createContext(false);
export const useEditing = () => useContext(EditingContext);
