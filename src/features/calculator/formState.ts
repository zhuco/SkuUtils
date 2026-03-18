import type { WorkbenchForm } from "../../types";

export const emptyWorkbenchForm: WorkbenchForm = {
  id: null,
  name: "",
  unitCost: null,
  unitWeight: null,
  selectedSpecIds: []
};

export function mergeWorkbenchForm(current: WorkbenchForm, next: Partial<WorkbenchForm>): WorkbenchForm {
  return {
    id: next.id === undefined ? current.id : next.id,
    name: next.name === undefined ? current.name : next.name,
    unitCost: next.unitCost === undefined ? current.unitCost : next.unitCost,
    unitWeight: next.unitWeight === undefined ? current.unitWeight : next.unitWeight,
    selectedSpecIds: next.selectedSpecIds === undefined ? current.selectedSpecIds : next.selectedSpecIds
  };
}
