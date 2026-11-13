import test from "node:test";
import assert from "node:assert/strict";
import { pickNextAction } from "../js/nextAction.js";

const now = new Date(2026, 9, 19, 12, 0, 0);

test("selects the next task due today and keeps checklist steps inside their parent", () => {
  const action = { id: 1, title: "Entregar informe", scheduled_datetime: new Date(2026, 9, 19, 14).toISOString() };
  const step = { id: 2, title: "Revisar cifras", parent_task_id: 1 };
  const later = { id: 3, title: "Pedir hora", scheduled_datetime: new Date(2026, 9, 20, 10).toISOString() };

  const result = pickNextAction([step, later, action], now);

  assert.equal(result.current.id, action.id);
  assert.equal(result.activeTask, null);
});

test("an active checklist step keeps its parent action in the home recommendation", () => {
  const action = { id: 10, title: "Preparar informe", scheduled_datetime: new Date(2026, 9, 19, 9).toISOString() };
  const currentStep = { id: 11, title: "Revisar la evidencia", parent_task_id: 10, started_at: new Date(2026, 9, 19, 11).toISOString() };
  const nextStep = { id: 12, title: "Escribir resumen", parent_task_id: 10 };
  const overdue = { id: 13, title: "Pagar cuenta", due_datetime: new Date(2026, 9, 18, 23, 59).toISOString() };

  const result = pickNextAction([action, currentStep, nextStep, overdue], now);

  assert.equal(result.current.id, action.id);
  assert.equal(result.activeAction.id, action.id);
  assert.equal(result.activeTask.id, currentStep.id);
  assert.match(result.reason, /Ya empezaste/);
});

test("the current timer task is recognized as active before it has a database start timestamp", () => {
  const oldWindow = globalThis.window;
  globalThis.window = { brisaTimer: { hasSession: () => true, linkedTask: () => 21 } };
  try {
    const action = { id: 20, title: "Grabar demo" };
    const step = { id: 21, title: "Abrir el proyecto", parent_task_id: 20 };
    const result = pickNextAction([action, step], now);
    assert.equal(result.current.id, action.id);
    assert.equal(result.activeTask.id, step.id);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});
