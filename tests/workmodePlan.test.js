import test from "node:test";
import assert from "node:assert/strict";
import { eventPhaseLabel, getActionPlan, timerScope } from "../js/workmodePlan.js";

test("simple action has no checklist and keeps its action as the current focus", () => {
  const task = { id: 1, title: "Pedir hora al dentista" };
  const plan = getActionPlan(task, [task]);

  assert.equal(plan.action, task);
  assert.equal(plan.total, 0);
  assert.equal(plan.currentStep, null);
  assert.equal(plan.nextStep, null);
  assert.equal(timerScope(task), "esta sesión");
});

test("a checklist step shows its parent action, ordered plan, progress and current step", () => {
  const action = { id: 1, title: "Preparar el viaje" };
  const first = { id: 2, parent_task_id: 1, title: "Comprar pasajes", created_at: "2026-10-01", is_completed: true };
  const second = { id: 3, parent_task_id: 1, title: "Hacer la maleta", created_at: "2026-10-02", is_completed: false };
  const plan = getActionPlan(second, [action, second, first]);

  assert.equal(plan.action, action);
  assert.equal(plan.parent, action);
  assert.deepEqual(plan.steps, [first, second]);
  assert.equal(plan.currentStep, second);
  assert.equal(plan.nextStep, second);
  assert.equal(plan.done, 1);
  assert.equal(plan.total, 2);
  assert.equal(plan.pending, 1);
  assert.equal(timerScope(second), "esta sesión");
});

test("checklist order follows saved positions instead of creation order", () => {
  const action = { id: 20, title: "Ordenar el escritorio" };
  const earlier = { id: 21, parent_task_id: 20, title: "Paso creado antes", position: 1, created_at: "2026-10-01" };
  const later = { id: 22, parent_task_id: 20, title: "Paso movido arriba", position: 0, created_at: "2026-10-02" };
  const plan = getActionPlan(action, [action, earlier, later]);

  assert.deepEqual(plan.steps, [later, earlier]);
  assert.equal(plan.nextStep, later);
});

test("an action overview suggests the first unfinished checklist step", () => {
  const action = { id: 10, title: "Enviar propuesta" };
  const done = { id: 11, parent_task_id: 10, title: "Revisar cifras", is_completed: true };
  const next = { id: 12, parent_task_id: 10, title: "Escribir correo", is_completed: false };
  const later = { id: 13, parent_task_id: 10, title: "Enviar", is_completed: false };
  const plan = getActionPlan(action, [action, done, next, later]);

  assert.equal(plan.currentStep, next);
  assert.equal(plan.nextStep, next);
  assert.equal(plan.pending, 2);
});

test("event preparation phases have clear user-facing labels", () => {
  assert.equal(eventPhaseLabel("prep"), "Preparar antes");
  assert.equal(eventPhaseLabel("leave"), "Antes de salir");
  assert.equal(eventPhaseLabel("during"), "Ese día");
  assert.equal(eventPhaseLabel(null), "Preparación");
});
