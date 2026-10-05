import type { Component } from 'svelte';
import FirstListener from '../listeners/boards/FirstListener.svelte';
import PickerAdd from '../listeners/boards/PickerAdd.svelte';
import PickerDelete from '../listeners/boards/PickerDelete.svelte';
import PickerFirstRun from '../listeners/boards/PickerFirstRun.svelte';
import PickerManage from '../listeners/boards/PickerManage.svelte';
import PickerNameTaken from '../listeners/boards/PickerNameTaken.svelte';
import PickerOnlyOne from '../listeners/boards/PickerOnlyOne.svelte';
import SwitchListener from '../listeners/boards/SwitchListener.svelte';
import SwitchTablet from '../listeners/boards/SwitchTablet.svelte';

/** W1 listener boards: FirstListener, PickerFirstRun, SwitchListener, SwitchTablet, PickerManage, PickerAdd, PickerNameTaken, PickerDelete, PickerOnlyOne. */
export const listenerBoards: Record<string, Component> = {
  FirstListener,
  PickerFirstRun,
  SwitchListener,
  SwitchTablet,
  PickerManage,
  PickerAdd,
  PickerNameTaken,
  PickerDelete,
  PickerOnlyOne,
};
