import type { Component } from 'svelte';
import Allowance from '../account/boards/Allowance.svelte';
import AllowanceLimit from '../account/boards/AllowanceLimit.svelte';
import KeyProblem from '../account/boards/KeyProblem.svelte';
import PremiumAccount from '../account/boards/PremiumAccount.svelte';

/** W4 account boards: PremiumAccount, KeyProblem, Allowance, AllowanceLimit. */
export const accountBoards: Record<string, Component> = {
  PremiumAccount,
  KeyProblem,
  Allowance,
  AllowanceLimit,
};
