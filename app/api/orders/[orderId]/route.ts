import { NextRequest, NextResponse } from "next/server"
import { orderStatements, orderItemStatements, inventoryStatements, db } from "@/lib/database"
import { mapOrderRow } from "@/lib/server/orders"
import type { OrderStatus } from "@/lib/types/orders"
import { isOrderStatus } from "@/lib/types/orders"

interface UpdateOrderPayload {
  status?: string
  pharmacyId?: string
  courierId?: string
  estimatedDelivery?: string
}

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  processing: ["accepted", "cancelled"],
  accepted: ["delivering", "cancelled"],
  delivering: ["delivered"],
  delivered: [],
  cancelled: [],
}

export async function PATCH(request: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const { orderId } = params
    const existingRow = orderStatements.getById.get(orderId)

    if (!existingRow) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const currentOrder = mapOrderRow(existingRow)

    const body = (await request.json()) as UpdateOrderPayload

    if (!body?.status || !isOrderStatus(body.status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
    }

  const currentStatus = currentOrder.status
    const nextStatus = body.status as OrderStatus

    if (currentStatus === nextStatus) {
      const unchangedOrder = mapOrderRow(existingRow)
      return NextResponse.json(unchangedOrder)
    }

    const allowedTransitions = ORDER_TRANSITIONS[currentStatus] ?? []
    if (!allowedTransitions.includes(nextStatus)) {
      return NextResponse.json({ error: "Transición de estado no permitida" }, { status: 409 })
    }

    if ((nextStatus === "accepted" || nextStatus === "cancelled") && body.pharmacyId !== currentOrder.pharmacyId) {
      return NextResponse.json({ error: "La farmacia no coincide con el pedido" }, { status: 403 })
    }

    let updatedCourierId: string | null = currentOrder.courierId ?? null

    if (nextStatus === "delivering") {
      if (!body.courierId) {
        return NextResponse.json({ error: "El repartidor es obligatorio" }, { status: 400 })
      }
      if (currentStatus !== "accepted") {
        return NextResponse.json({ error: "El pedido no está disponible para repartidores" }, { status: 409 })
      }
      if (currentOrder.courierId && currentOrder.courierId !== body.courierId) {
        return NextResponse.json({ error: "El pedido ya fue tomado por otro repartidor" }, { status: 409 })
      }
      updatedCourierId = body.courierId
    }

    if (nextStatus === "delivered") {
      if (!body.courierId) {
        return NextResponse.json({ error: "El repartidor es obligatorio" }, { status: 400 })
      }
      if (!currentOrder.courierId || currentOrder.courierId !== body.courierId) {
        return NextResponse.json({ error: "Solo el repartidor asignado puede cerrar el pedido" }, { status: 403 })
      }
      updatedCourierId = currentOrder.courierId
    }

    if (nextStatus === "accepted" || nextStatus === "cancelled") {
      updatedCourierId = null
    }

    const restockAdjustments: Array<{ medicationId: number; stock: number; price: number; operation: "update" | "insert" }> = []

    if (nextStatus === "cancelled") {
      const orderItemRows = orderItemStatements.getByOrderId.all(orderId) as Array<{
        medicationId: number
        quantity: number
        unitPrice: number
        finalPrice: number
      }>

      const quantitiesByMedication = new Map<number, { quantity: number; fallbackPrice: number }>()

      for (const row of orderItemRows) {
        const medicationId = Number(row.medicationId)
        const quantity = Math.max(0, Number(row.quantity ?? 0))
        const fallbackPriceValue = Number(row.unitPrice ?? row.finalPrice ?? 0)
        const fallbackPrice = Number.isFinite(fallbackPriceValue) && fallbackPriceValue > 0 ? fallbackPriceValue : 0
        const existing = quantitiesByMedication.get(medicationId)

        if (existing) {
          existing.quantity += quantity
          if (existing.fallbackPrice <= 0 && fallbackPrice > 0) {
            existing.fallbackPrice = fallbackPrice
          }
        } else {
          quantitiesByMedication.set(medicationId, {
            quantity,
            fallbackPrice,
          })
        }
      }

      for (const [medicationId, request] of quantitiesByMedication.entries()) {
        const inventoryRecord = inventoryStatements.getItem.get(currentOrder.pharmacyId, medicationId) as any

        if (inventoryRecord) {
          const currentStock = Number(inventoryRecord.stock ?? 0)
          restockAdjustments.push({
            medicationId,
            stock: currentStock + request.quantity,
            price: Number(inventoryRecord.precio ?? request.fallbackPrice ?? 0),
            operation: "update",
          })
        } else {
          restockAdjustments.push({
            medicationId,
            stock: request.quantity,
            price: request.fallbackPrice,
            operation: "insert",
          })
        }
      }
    }

    const now = new Date().toISOString()
    const actualDelivery = nextStatus === "delivered" ? now : null
    const estimatedDelivery = body.estimatedDelivery ?? null

    const applyUpdate = db.transaction(() => {
      orderStatements.updateLifecycle.run(
        nextStatus,
        updatedCourierId,
        estimatedDelivery,
        actualDelivery,
        now,
        orderId,
      )

      restockAdjustments.forEach((adjustment) => {
        if (adjustment.operation === "update") {
          inventoryStatements.update.run(
            adjustment.price,
            adjustment.stock,
            now,
            currentOrder.pharmacyId,
            adjustment.medicationId,
          )
        } else {
          inventoryStatements.insert.run(
            currentOrder.pharmacyId,
            adjustment.medicationId,
            adjustment.price,
            adjustment.stock,
            now,
          )
        }
      })
    })

    // Temporarily disable foreign key constraint to allow setting courierId to null
    const currentForeignKeyState = db.pragma('foreign_keys', { simple: true })
    db.pragma('foreign_keys = OFF')
    
    try {
      applyUpdate()
    } finally {
      // Restore previous state
      if (currentForeignKeyState) {
        db.pragma('foreign_keys = ON')
      }
    }

    applyUpdate()

  const updatedRow = orderStatements.getById.get(orderId)
  const updatedOrder = updatedRow ? mapOrderRow(updatedRow) : null

  return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error("Error updating order:", error)
    return NextResponse.json({ error: "Error al actualizar el pedido" }, { status: 500 })
  }
}
