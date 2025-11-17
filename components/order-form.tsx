"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, FileText, CheckCircle2, AlertCircle, X } from "lucide-react"
import type { ClientMedication, ClientMedicationPrice } from "@/lib/types/client-medication"
import { useToast } from "@/hooks/use-toast"
import { buildCoordinate, calculateDeliveryQuote } from "@/lib/utils/delivery"

interface OrderFormProps {
  medication: ClientMedication
  pharmacyPrice: ClientMedicationPrice
  pharmacyName: string
  deliveryFee: number
  onSuccess: () => void
  onCancel: () => void
}

export function OrderForm({ medication, pharmacyPrice, pharmacyName, deliveryFee, onSuccess, onCancel }: OrderFormProps) {
  const [formData, setFormData] = useState({
    quantity: 1,
    deliveryAvenida: "",
    deliveryCalle: "",
    deliveryInstructions: "",
    paymentMethod: "efectivo",
    prescriptionFile: null as File | null,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [availableStock, setAvailableStock] = useState<number | null>(() => {
    const initial = Number(pharmacyPrice.stock ?? 0)
    if (!Number.isFinite(initial)) return null
    return Math.max(0, Math.floor(initial))
  })
  const [isCheckingStock, setIsCheckingStock] = useState(false)
  const [stockFetchError, setStockFetchError] = useState<string | null>(null)
  const { toast } = useToast()

  const user = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("user") || "{}") : {}
  const userInsurance = user.obraSocial || ""

  const fetchCurrentStock = useCallback(async () => {
    setIsCheckingStock(true)
    setStockFetchError(null)
    try {
      const params = new URLSearchParams({ pharmacyId: pharmacyPrice.pharmacyId })
      const response = await fetch(`/api/medications?${params.toString()}`, { cache: "no-store" })
      if (!response.ok) {
        throw new Error("No se pudo verificar el stock en tiempo real")
      }

      const payload = (await response.json().catch(() => null)) as unknown
      const entries = Array.isArray(payload) ? payload : payload ? [payload] : []
      const matchingEntry = entries.find((entry: any) => Number(entry.medicationId ?? entry.id) === medication.id)

      if (!matchingEntry) {
        setAvailableStock(0)
        setStockFetchError("Este medicamento ya no está disponible en esta farmacia.")
        return 0
      }

      const nextStock = Number(matchingEntry.stock ?? matchingEntry.inStock ?? 0)
      const sanitized = Number.isFinite(nextStock) ? Math.max(0, Math.floor(nextStock)) : 0
      setAvailableStock(sanitized)
      setFormData((prev) => {
        if (sanitized > 0 && prev.quantity > sanitized) {
          return { ...prev, quantity: sanitized }
        }
        return prev
      })
      return sanitized
    } catch (error) {
      console.error("Error al consultar el stock actual", error)
      setStockFetchError(error instanceof Error ? error.message : "No se pudo verificar el stock actual")
      return null
    } finally {
      setIsCheckingStock(false)
    }
  }, [medication.id, pharmacyPrice.pharmacyId])

  useEffect(() => {
    fetchCurrentStock()
  }, [fetchCurrentStock])

  const pharmacyCoordinate = useMemo(
    () => buildCoordinate(pharmacyPrice.pharmacyAvenida, pharmacyPrice.pharmacyCalle),
    [pharmacyPrice.pharmacyAvenida, pharmacyPrice.pharmacyCalle],
  )

  const deliveryCoordinate = useMemo(() => {
    const avenidaValue = Number.parseInt(formData.deliveryAvenida, 10)
    const calleValue = Number.parseInt(formData.deliveryCalle, 10)

    if (!Number.isInteger(avenidaValue) || avenidaValue <= 0) {
      return null
    }

    if (!Number.isInteger(calleValue) || calleValue <= 0) {
      return null
    }

    return buildCoordinate(avenidaValue, calleValue)
  }, [formData.deliveryAvenida, formData.deliveryCalle])

  const deliveryQuote = useMemo(
    () => calculateDeliveryQuote(pharmacyCoordinate, deliveryCoordinate),
    [pharmacyCoordinate, deliveryCoordinate],
  )

  const fallbackDeliveryFee = (() => {
    if (typeof deliveryFee === "number" && Number.isFinite(deliveryFee)) {
      return deliveryFee
    }
    if (typeof pharmacyPrice.deliveryFee === "number" && Number.isFinite(pharmacyPrice.deliveryFee)) {
      return pharmacyPrice.deliveryFee
    }
    return 0
  })()

  const effectiveDeliveryFee = pharmacyCoordinate && deliveryCoordinate ? deliveryQuote.fee : fallbackDeliveryFee
  const baseUnitPrice = pharmacyPrice.price
  const finalUnitPrice = baseUnitPrice
  const subtotal = finalUnitPrice * formData.quantity
  const total = subtotal + effectiveDeliveryFee

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validFormats = ["image/jpeg", "image/png", "application/pdf"]
    if (!validFormats.includes(file.type)) {
      setErrors({ ...errors, prescriptionFile: "Solo se permiten archivos JPG, PNG o PDF" })
      return
    }

    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      setErrors({ ...errors, prescriptionFile: "El archivo no debe superar los 10MB" })
      return
    }

    setFormData({ ...formData, prescriptionFile: file })
    setErrors({ ...errors, prescriptionFile: "" })
    setUploadSuccess(true)
  }

  const removeFile = () => {
    setFormData({ ...formData, prescriptionFile: null })
    setUploadSuccess(false)
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    const avenidaValue = Number.parseInt(formData.deliveryAvenida, 10)
    if (!Number.isInteger(avenidaValue) || avenidaValue <= 0) {
      newErrors.deliveryAvenida = "La avenida debe ser un número entero positivo"
    }

    const calleValue = Number.parseInt(formData.deliveryCalle, 10)
    if (!Number.isInteger(calleValue) || calleValue <= 0) {
      newErrors.deliveryCalle = "La calle debe ser un número entero positivo"
    }

    if (!formData.paymentMethod) {
      newErrors.paymentMethod = "Debe seleccionar un método de pago"
    }

    if (medication.requiresPrescription && !formData.prescriptionFile) {
      newErrors.prescriptionFile = "Debe cargar la receta médica"
    }

    if (formData.quantity < 1) {
      newErrors.quantity = "La cantidad debe ser al menos 1"
    } else if (availableStock !== null && availableStock <= 0) {
      newErrors.quantity = "Este medicamento no tiene stock disponible"
    } else if (availableStock !== null && formData.quantity > availableStock) {
      newErrors.quantity = `Solo quedan ${availableStock} unidad${availableStock === 1 ? "" : "es"}`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setSubmitError(null)

    if (!validateForm()) return

    if (!user?.id) {
      setSubmitError("Debes iniciar sesión como cliente para realizar un pedido")
      toast({ title: "Sesión requerida", description: "Inicia sesión para completar el pedido." })
      return
    }

    if (user.role && user.role !== "Cliente") {
      setSubmitError("Solo los clientes pueden realizar pedidos")
      toast({ title: "Permiso denegado", description: "Tu rol no permite crear pedidos." })
      return
    }

    setIsSubmitting(true)

    try {
      const deliveryAvenidaValue = Number.parseInt(formData.deliveryAvenida, 10)
      const deliveryCalleValue = Number.parseInt(formData.deliveryCalle, 10)
      const formattedDeliveryAddress = `Avenida ${deliveryAvenidaValue}, Calle ${deliveryCalleValue}`

      const latestStock = await fetchCurrentStock()
      if (latestStock === null) {
        setSubmitError("No pudimos verificar el stock actual. Intenta nuevamente en unos segundos.")
        setIsSubmitting(false)
        return
      }

      if (latestStock <= 0) {
        setErrors((prev) => ({
          ...prev,
          quantity: "Este medicamento ya no tiene stock disponible",
        }))
        setIsSubmitting(false)
        return
      }

      if (formData.quantity > latestStock) {
        setErrors((prev) => ({
          ...prev,
          quantity: `Solo quedan ${latestStock} unidad${latestStock === 1 ? "" : "es"}`,
        }))
        setFormData((prev) => ({ ...prev, quantity: Math.max(1, latestStock) }))
        setIsSubmitting(false)
        return
      }

      const payload = {
        customerId: user.id,
        pharmacyId: pharmacyPrice.pharmacyId,
        pharmacyName,
        deliveryAddress: formattedDeliveryAddress,
        deliveryAvenida: deliveryAvenidaValue,
        deliveryCalle: deliveryCalleValue,
        deliveryInstructions: formData.deliveryInstructions || null,
        paymentMethod: formData.paymentMethod,
        insuranceUsed: userInsurance || "",
        prescriptionRequired: medication.requiresPrescription,
        prescriptionUploaded: Boolean(formData.prescriptionFile),
        prescriptionStatus: "pending" as const,
        prescriptionFileName: formData.prescriptionFile?.name || null,
        items: [
          {
            medicationId: medication.id,
            medicationName: medication.name,
            brand: medication.brand,
            quantity: formData.quantity,
            unitPrice: baseUnitPrice,
            finalPrice: subtotal,
            insuranceSavings: 0,
          },
        ],
        deliveryFee: effectiveDeliveryFee,
      }

      const submission = new FormData()
      submission.append("payload", JSON.stringify(payload))
      if (formData.prescriptionFile) {
        submission.append("prescriptionFile", formData.prescriptionFile)
      }

      const response = await fetch("/api/orders", {
        method: "POST",
        body: submission,
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string; availableStock?: number | null } | null
        const backendStock =
          typeof errorData?.availableStock === "number" && Number.isFinite(errorData.availableStock)
            ? Math.max(0, Math.floor(errorData.availableStock))
            : null

        if (backendStock !== null) {
          setAvailableStock(backendStock)
          if (backendStock === 0) {
            setErrors((prev) => ({
              ...prev,
              quantity: "Este medicamento ya no tiene stock disponible",
            }))
            setFormData((prev) => ({ ...prev, quantity: Math.max(1, prev.quantity) }))
          } else if (formData.quantity > backendStock) {
            setErrors((prev) => ({
              ...prev,
              quantity: `Solo quedan ${backendStock} unidad${backendStock === 1 ? "" : "es"}`,
            }))
            setFormData((prev) => ({ ...prev, quantity: Math.max(1, backendStock) }))
          }
        } else {
          await fetchCurrentStock()
        }

        const message = errorData?.error || "No se pudo crear el pedido"
        setSubmitError(message)
        toast({ title: "Error al crear el pedido", description: message })
        return
      }

      toast({ title: "Pedido creado", description: "Tu pedido fue registrado correctamente." })
      onSuccess()
    } catch (error) {
      console.error("Error creating order", error)
      const message = "Ocurrió un problema al registrar el pedido"
      setSubmitError(message)
      toast({ title: "Error inesperado", description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!pharmacyPrice) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No se pudo cargar la información del pedido</AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Resumen del pedido */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Resumen del Pedido</h3>
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium">Medicamento:</span> {medication.name}
          </p>
          <p>
            <span className="font-medium">Farmacia:</span> {pharmacyName}
          </p>
          <p>
            <span className="font-medium">Precio unitario:</span> ${finalUnitPrice.toLocaleString()}
          </p>
          {pharmacyCoordinate && deliveryCoordinate && deliveryQuote.distance !== null && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Distancia estimada:</span> {deliveryQuote.distance.toFixed(2)} cuadras
            </p>
          )}
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Stock actual:</span>{" "}
            {isCheckingStock
              ? "Verificando..."
              : availableStock === null
                  ? "No disponible"
                  : `${availableStock} unidad${availableStock === 1 ? "" : "es"}`}
          </p>
        </div>
      </div>

      {/* Cantidad */}
      <div className="space-y-2">
        <Label htmlFor="quantity">Cantidad</Label>
        <Input
          id="quantity"
          type="number"
          min="1"
          value={formData.quantity}
          onChange={(e) => {
            const raw = Number.parseInt(e.target.value, 10)
            const sanitized = Number.isFinite(raw) && raw > 0 ? raw : 1
            const limited =
              availableStock !== null && availableStock > 0 ? Math.min(sanitized, availableStock) : sanitized
            setFormData({ ...formData, quantity: limited })
          }}
          className={errors.quantity ? "border-destructive" : ""}
        />
        {errors.quantity && <p className="text-sm text-destructive">{errors.quantity}</p>}
        <p className="text-xs text-muted-foreground">
          {isCheckingStock
            ? "Verificando stock disponible..."
            : availableStock === null
                ? "No pudimos determinar el stock actual"
                : `Stock disponible: ${availableStock} unidad${availableStock === 1 ? "" : "es"}`}
        </p>
        {stockFetchError && <p className="text-xs text-amber-600">{stockFetchError}</p>}
      </div>

      {/* Dirección de entrega */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="deliveryAvenida">
            Avenida <span className="text-destructive">*</span>
          </Label>
          <Input
            id="deliveryAvenida"
            type="number"
            min={1}
            step={1}
            placeholder="Ej: 1200"
            value={formData.deliveryAvenida}
            onChange={(e) => setFormData({ ...formData, deliveryAvenida: e.target.value })}
            className={errors.deliveryAvenida ? "border-destructive" : ""}
          />
          {errors.deliveryAvenida && <p className="text-sm text-destructive">{errors.deliveryAvenida}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="deliveryCalle">
            Calle <span className="text-destructive">*</span>
          </Label>
          <Input
            id="deliveryCalle"
            type="number"
            min={1}
            step={1}
            placeholder="Ej: 800"
            value={formData.deliveryCalle}
            onChange={(e) => setFormData({ ...formData, deliveryCalle: e.target.value })}
            className={errors.deliveryCalle ? "border-destructive" : ""}
          />
          {errors.deliveryCalle && <p className="text-sm text-destructive">{errors.deliveryCalle}</p>}
        </div>
      </div>

      {/* Instrucciones de entrega */}
      <div className="space-y-2">
        <Label htmlFor="deliveryInstructions">Instrucciones de entrega (opcional)</Label>
        <Textarea
          id="deliveryInstructions"
          placeholder="Ej: Tocar timbre 3B, dejar con portero, etc."
          value={formData.deliveryInstructions}
          onChange={(e) => setFormData({ ...formData, deliveryInstructions: e.target.value })}
          rows={3}
        />
      </div>

      {/* Carga de receta médica */}
      {medication.requiresPrescription && (
        <div className="space-y-2">
          <Label htmlFor="prescription">
            Receta médica <span className="text-destructive">*</span>
          </Label>
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            {!formData.prescriptionFile ? (
              <>
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">Arrastra tu receta aquí o haz clic para seleccionar</p>
                <p className="text-xs text-muted-foreground mb-4">Formatos: JPG, PNG, PDF (máx. 10MB)</p>
                <Input
                  id="prescription"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => document.getElementById("prescription")?.click()}
                >
                  Seleccionar archivo
                </Button>
              </>
            ) : (
              <div className="flex items-center justify-between bg-muted rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <p className="font-medium text-sm">{formData.prescriptionFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(formData.prescriptionFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={removeFile}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          {uploadSuccess && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">Receta cargada correctamente</AlertDescription>
            </Alert>
          )}
          {errors.prescriptionFile && <p className="text-sm text-destructive">{errors.prescriptionFile}</p>}
        </div>
      )}

      {/* Método de pago */}
      <div className="space-y-2">
        <Label htmlFor="paymentMethod">
          Método de pago <span className="text-destructive">*</span>
        </Label>
        <Select
          value={formData.paymentMethod}
          onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
        >
          <SelectTrigger className={errors.paymentMethod ? "border-destructive" : ""}>
            <SelectValue placeholder="Selecciona un método de pago" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="efectivo">Efectivo</SelectItem>
          </SelectContent>
        </Select>
        {errors.paymentMethod && <p className="text-sm text-destructive">{errors.paymentMethod}</p>}
      </div>

      {/* Total */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span>
            Subtotal ({formData.quantity} unidad{formData.quantity > 1 ? "es" : ""})
          </span>
          <span>${subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Envío</span>
          <span>${effectiveDeliveryFee.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-bold text-lg pt-2 border-t">
          <span>Total</span>
          <span className="text-primary">${total.toLocaleString()}</span>
        </div>
        {submitError && <p className="text-sm text-destructive">{submitError}</p>}
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1 bg-transparent"
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-primary text-primary-foreground"
          disabled={
            isSubmitting ||
            isCheckingStock ||
            (availableStock !== null && availableStock <= 0)
          }
        >
          {isSubmitting ? "Procesando..." : "Confirmar Pedido"}
        </Button>
      </div>
    </form>
  )
}
