"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Building2, Clock, Star, Truck, Package, ShoppingCart, Check } from "lucide-react"
import { pharmacies as fallbackPharmacies } from "@/lib/data/pharmacies"
import type { ClientMedication, ClientMedicationPrice } from "@/lib/types/client-medication"
import { OrderForm } from "./order-form"

interface MedicationCardWithPharmaciesProps {
  medication: ClientMedication
}

interface AvailablePharmacyEntry {
  id: string
  name: string
  rating: number
  deliveryTime: string | null
  deliveryFee: number
  isOpen: boolean
  originalPrice: number
  displayedPrice: number
  hasDiscount: boolean
  stock: number
  priceData: ClientMedicationPrice
}

const normalizeStockValue = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor(parsed))
}

const fallbackPharmacyMap = new Map(
  fallbackPharmacies.flatMap((pharmacy) => [
    [pharmacy.id, pharmacy],
    [pharmacy.id.toLowerCase(), pharmacy],
  ]),
)

export function MedicationCardWithPharmacies({ medication }: MedicationCardWithPharmaciesProps) {
  const [selectedPharmacy, setSelectedPharmacy] = useState<AvailablePharmacyEntry | null>(null)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [pharmacyStocks, setPharmacyStocks] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    medication.prices.forEach((price) => {
      initial[price.pharmacyId] = normalizeStockValue(price.stock) ?? 0
    })
    return initial
  })

  const pharmacyIds = useMemo(
    () => Array.from(new Set(medication.prices.map((price) => price.pharmacyId).filter(Boolean))),
    [medication.prices],
  )

  const refreshStocks = useCallback(async () => {
    if (pharmacyIds.length === 0) {
      return
    }

    try {
      const results = await Promise.allSettled(
        pharmacyIds.map(async (pharmacyId) => {
          const params = new URLSearchParams({ pharmacyId })
          const response = await fetch(`/api/medications?${params.toString()}`, { cache: "no-store" })
          if (!response.ok) {
            throw new Error(`No se pudo obtener el stock para la farmacia ${pharmacyId}`)
          }

          const payload = await response.json().catch(() => null)
          const entries = Array.isArray(payload) ? payload : payload ? [payload] : []
          const match = entries.find(
            (entry: any) => Number(entry.medicationId ?? entry.id) === medication.id,
          )

          const normalized =
            normalizeStockValue(match?.stock) ??
            normalizeStockValue(match?.availableStock) ??
            normalizeStockValue(match?.inventory) ??
            normalizeStockValue(match?.quantity)

          const fallbackStock = typeof match?.inStock === "boolean" ? (match.inStock ? 1 : 0) : 0

          return {
            pharmacyId,
            stock: normalized ?? fallbackStock,
          }
        }),
      )

      const updates: Record<string, number> = {}

      for (const result of results) {
        if (result.status === "fulfilled") {
          const sanitized = normalizeStockValue(result.value.stock) ?? 0
          updates[result.value.pharmacyId] = sanitized
        } else {
          console.error("Error actualizando stock", result.reason)
        }
      }

      if (Object.keys(updates).length > 0) {
        setPharmacyStocks((prev) => ({ ...prev, ...updates }))
      }
    } catch (error) {
      console.error("Error actualizando stock", error)
    }
  }, [pharmacyIds, medication.id])

  useEffect(() => {
    refreshStocks()
  }, [refreshStocks])

  useEffect(() => {
    setPharmacyStocks((prev) => {
      let updated = false
      const next = { ...prev }

      medication.prices.forEach((price) => {
        if (!(price.pharmacyId in next)) {
          next[price.pharmacyId] = normalizeStockValue(price.stock) ?? 0
          updated = true
        }
      })

      return updated ? next : prev
    })
  }, [medication.prices])

  const availablePharmacies: AvailablePharmacyEntry[] = useMemo(() => {
    return medication.prices
      .map((price) => {
        const fallback =
          fallbackPharmacyMap.get(price.pharmacyId) ||
          (price.pharmacySlug ? fallbackPharmacyMap.get(price.pharmacySlug) : undefined)
        const displayedPrice = price.price
        const stateStock = pharmacyStocks[price.pharmacyId]
        const fallbackStock = normalizeStockValue(price.stock) ?? 0
        const resolvedStock = stateStock !== undefined ? stateStock : fallbackStock
        const stock = resolvedStock > 0 ? resolvedStock : 0

        if (stock <= 0) {
          return null
        }

        return {
          id: price.pharmacyId,
          name: price.pharmacyName ?? fallback?.name ?? price.pharmacyId,
          rating: price.rating ?? fallback?.rating ?? 0,
          deliveryTime: price.deliveryTime ?? fallback?.deliveryTime ?? null,
          deliveryFee: price.deliveryFee ?? fallback?.deliveryFee ?? 0,
          isOpen: price.isOpen ?? fallback?.isOpen ?? false,
          originalPrice: price.price,
          displayedPrice,
          hasDiscount: false,
          stock,
          priceData: {
            ...price,
            stock,
            inStock: stock > 0,
          },
        }
      })
      .filter((entry): entry is AvailablePharmacyEntry => Boolean(entry))
      .sort((a, b) => a.displayedPrice - b.displayedPrice)
  }, [medication.prices, pharmacyStocks])

  useEffect(() => {
    if (!selectedPharmacy) return

    const refreshedEntry = availablePharmacies.find((entry) => entry.id === selectedPharmacy.id)
    if (!refreshedEntry) {
      setSelectedPharmacy(null)
      if (showOrderForm) {
        setShowOrderForm(false)
      }
      return
    }

    if (refreshedEntry.stock !== selectedPharmacy.stock) {
      setSelectedPharmacy(refreshedEntry)
    }
  }, [availablePharmacies, selectedPharmacy, showOrderForm])

  useEffect(() => {
    if (availablePharmacies.length === 0) {
      if (showOrderForm) {
        setShowOrderForm(false)
      }
      if (selectedPharmacy) {
        setSelectedPharmacy(null)
      }
    }
  }, [availablePharmacies.length, selectedPharmacy, showOrderForm])

  const handlePharmacyClick = (entry: AvailablePharmacyEntry) => {
    setSelectedPharmacy(entry)
    setShowOrderForm(true)
  }

  if (availablePharmacies.length === 0) {
    return null
  }

  return (
    <>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        <CardHeader className="bg-muted/50">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-xl mb-2">{medication.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{medication.genericName}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline">{medication.category}</Badge>
                <Badge variant="secondary">{medication.brand}</Badge>
              </div>
            </div>
            <Package className="h-8 w-8 text-primary" />
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="mb-4 pb-4 border-b">
            <p className="text-sm text-muted-foreground">
              {medication.description || ""}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Farmacias disponibles ({availablePharmacies.length})
              </h4>
            </div>

            {availablePharmacies.map((pharmacy) => {
              const isSelected = selectedPharmacy?.id === pharmacy.id
              return (
                <button
                  key={pharmacy.id}
                  type="button"
                  onClick={() => handlePharmacyClick(pharmacy)}
                  className={`w-full border rounded-lg p-3 transition-all text-left ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "hover:border-primary hover:bg-muted/50"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className="font-semibold">{pharmacy.name}</h5>
                        {isSelected && (
                          <Badge className="bg-primary text-primary-foreground text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            Seleccionada
                          </Badge>
                        )}
                        {pharmacy.isOpen && (
                          <Badge variant="secondary" className="text-xs">
                            Abierto
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          {pharmacy.rating.toFixed(1)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {pharmacy.deliveryTime ?? "-"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />${pharmacy.deliveryFee.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3" />Stock: {pharmacy.stock} unidad{pharmacy.stock === 1 ? "" : "es"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      {pharmacy.hasDiscount ? (
                        <>
                          <p className="text-xs text-muted-foreground line-through">
                            ${pharmacy.originalPrice.toLocaleString()}
                          </p>
                          <p className="text-lg font-bold text-primary">
                            ${pharmacy.displayedPrice.toLocaleString()}
                          </p>
                        </>
                      ) : (
                        <p className="text-lg font-bold text-primary">
                          ${pharmacy.displayedPrice.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-2 text-sm text-primary font-medium">
                    <ShoppingCart className="h-4 w-4" />
                    Hacer clic para comprar
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={showOrderForm}
        onOpenChange={(nextOpen) => {
          setShowOrderForm(nextOpen)
          if (!nextOpen) {
            setSelectedPharmacy(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Realizar Pedido</DialogTitle>
          </DialogHeader>
          {selectedPharmacy && (
            <OrderForm
              medication={medication}
              pharmacyPrice={selectedPharmacy.priceData}
              pharmacyName={selectedPharmacy.name}
              deliveryFee={selectedPharmacy.deliveryFee}
              onSuccess={() => {
                setShowOrderForm(false)
                setSelectedPharmacy(null)
              }}
              onCancel={() => {
                setShowOrderForm(false)
                setSelectedPharmacy(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
