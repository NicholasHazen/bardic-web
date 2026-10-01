import type { Component } from 'svelte';
import DownloadProgress from '../offline/boards/DownloadProgress.svelte';
import DownloadSheet from '../offline/boards/DownloadSheet.svelte';
import Downloads from '../offline/boards/Downloads.svelte';
import HomeOffline from '../offline/boards/HomeOffline.svelte';
import ReadDownloading from '../offline/boards/ReadDownloading.svelte';
import ServerOffline from '../offline/boards/ServerOffline.svelte';
import StatesProgress from '../offline/boards/StatesProgress.svelte';
import StatesScreens from '../offline/boards/StatesScreens.svelte';
import StatesSheets from '../offline/boards/StatesSheets.svelte';
import UpdateAudio from '../offline/boards/UpdateAudio.svelte';

/** W5 offline boards (the OfflineStates* entries are galleries of states the design does not draw, not design boards): DownloadSheet, DownloadProgress, Downloads, UpdateAudio, ServerOffline, HomeOffline, ReadDownloading. */
export const offlineBoards: Record<string, Component> = { DownloadSheet, DownloadProgress, Downloads, UpdateAudio, ServerOffline, HomeOffline, ReadDownloading, OfflineStatesProgress: StatesProgress, OfflineStatesSheets: StatesSheets, OfflineStatesScreens: StatesScreens };
