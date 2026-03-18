import { describe, expect, it } from "vitest";
import { emptyWorkbenchForm, mergeWorkbenchForm } from "./formState";

describe("mergeWorkbenchForm", () => {
  it("preserves unmanaged fields when only registered inputs change", () => {
    const current = {
      ...emptyWorkbenchForm,
      id: "product-1",
      name: "旧商品",
      unitCost: 12.5,
      unitWeight: 300,
      selectedSpecIds: ["spec-1", "spec-2"]
    };

    expect(
      mergeWorkbenchForm(current, {
        name: "新商品",
        unitCost: 15
      })
    ).toEqual({
      ...current,
      name: "新商品",
      unitCost: 15
    });
  });

  it("allows clearing numeric fields back to null", () => {
    expect(
      mergeWorkbenchForm(
        {
          ...emptyWorkbenchForm,
          unitCost: 9.9,
          unitWeight: 120
        },
        {
          unitCost: null,
          unitWeight: null
        }
      )
    ).toEqual({
      ...emptyWorkbenchForm,
      unitCost: null,
      unitWeight: null
    });
  });
});
