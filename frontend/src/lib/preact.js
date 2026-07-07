// Single point of entry for Preact + htm, loaded from CDN (no build step).
// Every other module imports UI primitives from here so the pinned version
// only needs to change in one place.
import { h, Fragment, render } from "https://esm.sh/preact@10.19.6";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useReducer,
} from "https://esm.sh/preact@10.19.6/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

export { h, Fragment, render, useState, useEffect, useRef, useMemo, useCallback, useReducer, html };
