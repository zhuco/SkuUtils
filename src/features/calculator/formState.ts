import type { WorkbenchForm } from "../../types";

export const emptyWorkbenchForm: WorkbenchForm = {
  id: null,
  name: "",
  unitLabel: "件",
  unitCost: null,
  unitWeight: null,
  selectedSpecIds: []
};

export function mergeWorkbenchForm(current: WorkbenchForm, next: Partial<WorkbenchForm>): WorkbenchForm {
  return {
    id: next.id === undefined ? current.id : next.id,
    name: next.name === undefined ? current.name : next.name,
    unitLabel: next.unitLabel === undefined ? current.unitLabel : next.unitLabel,
    unitCost: next.unitCost === undefined ? current.unitCost : next.unitCost,
    unitWeight: next.unitWeight === undefined ? current.unitWeight : next.unitWeight,
    selectedSpecIds: next.selectedSpecIds === undefined ? current.selectedSpecIds : next.selectedSpecIds
  };
}
