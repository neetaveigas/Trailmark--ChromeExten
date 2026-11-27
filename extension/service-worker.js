/*
 * Trailmark service worker (classic script, Manifest V3).
 *
 * Day 3 (#10): loads the shared code and receives the build values. Event
 * listeners, validation and sending are added from day 4 onward (PLAN.md).
 */
'use strict';

importScripts('shared/events.js', 'shared/tracking-logic.js', 'shared/serial-queue.js');

// Filled in by scripts/build.js. Never type a real site key here (FR-1.4).
const TRAILMARK_SITE_KEY = '__TRAILMARK_SITE_KEY__';
const TRAILMARK_COLLECTOR_URL = '__TRAILMARK_COLLECTOR_URL__';
