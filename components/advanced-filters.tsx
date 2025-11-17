"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Filter, X } from "lucide-react"
import type { ClientPharmacyMeta } from "@/lib/types/client-medication"

interface AdvancedFiltersProps {
  onFiltersChange: (filters: FilterState) => void
  currentFilters: FilterState
  pharmacies: ClientPharmacyMeta[]
}

export interface FilterState {
  maxPrice: number
}

export function AdvancedFilters({ onFiltersChange, currentFilters, pharmacies }: AdvancedFiltersProps) {
  const [localFilters, setLocalFilters] = useState<FilterState>(currentFilters)

  useEffect(() => {
    setLocalFilters(currentFilters)
  }, [currentFilters])

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    const newFilters = { ...localFilters, [key]: value }
    setLocalFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const clearAllFilters = () => {
    const defaultFilters: FilterState = {
      maxPrice: 30000,
    }
    setLocalFilters(defaultFilters)
    onFiltersChange(defaultFilters)
  }

  const activeFiltersCount = localFilters.maxPrice < 30000 ? 1 : 0

  const handleManualPriceInput = (value: string) => {
    const numValue = Number(value)
    if (!isNaN(numValue) && numValue > 0) {
      handleFilterChange("maxPrice", numValue)
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className="relative">
          <Filter className="h-4 w-4 mr-2" />
          Filtros avanzados
          {activeFiltersCount > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs bg-secondary text-secondary-foreground">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filtros Avanzados</SheetTitle>
          <SheetDescription>Personaliza tu búsqueda según tus necesidades</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Price Range Filter */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rango de Precio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm">Máximo: ${localFilters.maxPrice}</Label>
                <Slider
                  value={[localFilters.maxPrice]}
                  onValueChange={([value]) => handleFilterChange("maxPrice", value)}
                  max={30000}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price-input" className="text-sm">
                  O ingresa el valor manualmente:
                </Label>
                <Input
                  id="price-input"
                  type="number"
                  min="1"
                  max="30000"
                  value={localFilters.maxPrice}
                  onChange={(e) => handleManualPriceInput(e.target.value)}
                  placeholder="Ej: 5000"
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>

          {/* Clear Filters */}
          {activeFiltersCount > 0 && (
            <Button variant="outline" onClick={clearAllFilters} className="w-full bg-transparent">
              <X className="h-4 w-4 mr-2" />
              Limpiar todos los filtros
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
