import type { Component } from 'svelte';
import EstimateExplained from '../plans/boards/EstimateExplained.svelte';
import PlanBlocked from '../plans/boards/PlanBlocked.svelte';
import PlanPaused from '../plans/boards/PlanPaused.svelte';
import PlanPremium from '../plans/boards/PlanPremium.svelte';

/** W4 plans boards: PlanPremium, EstimateExplained, PlanBlocked, PlanPaused. */
export const plansBoards: Record<string, Component> = { PlanPremium, EstimateExplained, PlanBlocked, PlanPaused };
