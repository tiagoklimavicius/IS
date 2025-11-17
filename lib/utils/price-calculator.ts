import type { MedicationPrice } from "@/lib/data/medications-multi-pharmacy"
import type { ClientMedicationPrice } from "@/lib/types/client-medication"

export interface PriceCalculation {
  originalPrice: number
  finalPrice: number
}

type PriceInput = MedicationPrice | ClientMedicationPrice

export function calculateFinalPrice(medicationPrice: PriceInput, userInsurance: string): PriceCalculation {
  // Solo usa el precio base, sin descuentos ni seguros
  return {
    originalPrice: medicationPrice.price,
    finalPrice: medicationPrice.price,
  }
}

export function formatPrice(price: number): string {
  return `$${(price / 100).toFixed(2)}`
}
