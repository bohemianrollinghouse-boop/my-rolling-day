import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";

export { React, createRoot, useEffect, useMemo, useRef, useState };
export const html = htm.bind(React.createElement);
