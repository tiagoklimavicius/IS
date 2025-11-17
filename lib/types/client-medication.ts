export interface ClientMedicationPrice {
  pharmacyId: string
  pharmacySlug: string
  pharmacyName: string
  price: number
  stock: number
  inStock: boolean
  lastUpdated: string
  rating?: number | null
  deliveryFee?: number | null
  deliveryTime?: string | null
  isOpen?: boolean | null
  minOrder?: number | null
  address?: string | null
  phone?: string | null
  logo?: string | null
  pharmacyAvenida?: number | null
  pharmacyCalle?: number | null
}

export interface ClientMedication {
  id: number
  name: string
  genericName: string
  brand: string
  category: string
  requiresPrescription: boolean
  description: string
  dosage: string
  presentation: string
  activeIngredient: string
  laboratory: string
  prices: ClientMedicationPrice[]
}

export interface ClientPharmacyMeta {
  id: string
  userId?: string
  name: string
  rating: number
  deliveryFee: number
  deliveryTime: string
  isOpen: boolean
  address?: string | null
  phone?: string | null
  logo?: string | null
  minOrder?: number | null
}
