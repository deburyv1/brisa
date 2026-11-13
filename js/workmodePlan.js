/* Pure helpers for the action context shown in the work station. */

export function getActionPlan(task, tasks = []) {
  if (!task) return { action: null, parent: null, steps: [], currentStep: null, nextStep: null, done: 0, total: 0, pending: 0 };

  const parent = task.parent_task_id == null
    ? null
    : tasks.find(item => String(item.id) === String(task.parent_task_id)) || null;
  const action = parent || task;
  const steps = tasks
    .filter(item => String(item.parent_task_id) === String(action.id))
    .sort((a, b) => {
      const aPosition = Number.isFinite(Number(a.position)) ? Number(a.position) : Number.MAX_SAFE_INTEGER;
      const bPosition = Number.isFinite(Number(b.position)) ? Number(b.position) : Number.MAX_SAFE_INTEGER;
      return aPosition - bPosition
        || new Date(a.created_at || 0) - new Date(b.created_at || 0)
        || Number(a.id) - Number(b.id);
    });
  const done = steps.filter(step => step.is_completed).length;
  const nextStep = steps.find(step => !step.is_completed) || null;
  const currentStep = parent ? task : nextStep;

  return {
    action,
    parent,
    steps,
    currentStep,
    nextStep,
    done,
    total: steps.length,
    pending: steps.length - done,
  };
}

export function timerScope(task) {
  return "esta sesión";
}

export function eventPhaseLabel(phase) {
  return ({ prep: "Preparar antes", leave: "Antes de salir", during: "Ese día" })[phase] || "Preparación";
}
