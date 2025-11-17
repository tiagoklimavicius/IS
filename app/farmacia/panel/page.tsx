"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Package,
  TrendingUp,
  Users,
  LogOut,
  ClipboardList,
  RefreshCcw,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
} from "lucide-react"
import type { FarmaciaUser } from "@/lib/types/user-types"
import type { OrderStatus, OrderWithItems } from "@/lib/types/orders"
import { useToast } from "@/hooks/use-toast"

const STATUS_LABELS: Record<OrderStatus, string> = {
  processing: "En proceso",
  accepted: "Aceptado",
  delivering: "En entrega",
  delivered: "Entregado",
  cancelled: "Cancelado",
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  accepted: "bg-purple-100 text-purple-800 border-purple-200",
  delivering: "bg-amber-100 text-amber-800 border-amber-200",
  delivered: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
}

const ACTIONABLE_STATUSES: OrderStatus[] = ["processing", "accepted"]

export default function FarmaciaPanelPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [farmacia, setFarmacia] = useState<FarmaciaUser | null>(null)
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [isLoadingUser, setIsLoadingUser] = useState(true)
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("user") : null
      if (!stored) {
        router.push("/auth")
        return
      }
      const parsed = JSON.parse(stored) as FarmaciaUser
      if (parsed.role !== "Farmacia") {
        router.push("/auth")
        return
      }
      setFarmacia(parsed)
    } catch (error) {
      console.error("Error leyendo el usuario de farmacia", error)
      router.push("/auth")
    } finally {
      setIsLoadingUser(false)
    }
  }, [router])

  const loadOrders = useCallback(
    async (pharmacyId: string, showSkeleton = true) => {
      setFetchError(null)
      if (showSkeleton) {
        setIsLoadingOrders(true)
      } else {
        setIsRefreshing(true)
      }

      try {
        const response = await fetch(`/api/orders?pharmacyId=${encodeURIComponent(pharmacyId)}`, {
          cache: "no-store",
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? "No se pudieron obtener los pedidos")
        }

        const data = (await response.json().catch(() => null)) as unknown
        if (!Array.isArray(data)) {
          throw new Error("Formato de datos inválido")
        }

        setOrders(data as OrderWithItems[])
      } catch (error) {
        console.error("Error cargando pedidos de farmacia", error)
        setFetchError(error instanceof Error ? error.message : "No se pudieron cargar los pedidos")
      } finally {
        if (showSkeleton) {
          setIsLoadingOrders(false)
        } else {
          setIsRefreshing(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    if (!farmacia?.id) return
    loadOrders(farmacia.id, true).catch((error) => console.error("Fallo inicial de pedidos", error))
  }, [farmacia?.id, loadOrders])

  const handleLogout = () => {
    window.localStorage.removeItem("user")
    router.push("/auth")
  }

  const updateOrderStatus = useCallback(
    async (orderId: string, nextStatus: OrderStatus) => {
      if (!farmacia) return

      setPendingOrderId(orderId)
      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus, pharmacyId: farmacia.id }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? "No se pudo actualizar el pedido")
        }

        const updatedOrder = (await response.json().catch(() => null)) as OrderWithItems | null
        if (!updatedOrder) {
          throw new Error("Respuesta vacía del servidor")
        }

        setOrders((prev) => prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)))
        toast({ title: "Pedido actualizado", description: `El estado cambió a ${STATUS_LABELS[nextStatus]}.` })
      } catch (error) {
        console.error("Error actualizando pedido", error)
        toast({
          title: "No se pudo actualizar",
          description: error instanceof Error ? error.message : "Intenta nuevamente en unos segundos",
          variant: "destructive",
        })
      } finally {
        setPendingOrderId(null)
      }
    },
    [farmacia, toast],
  )

  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "delivered" && order.status !== "cancelled"),
    [orders],
  )
  const completedOrders = useMemo(
    () => orders.filter((order) => order.status === "delivered" || order.status === "cancelled"),
    [orders],
  )

  const todayOrderCount = useMemo(() => {
    const today = new Date().toDateString()
    return orders.filter((order) => new Date(order.createdAt ?? order.date).toDateString() === today).length
  }, [orders])

  const monthlySales = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    return orders
      .filter((order) => {
        const orderDate = new Date(order.createdAt ?? order.date)
        return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear
      })
      .reduce((sum, order) => sum + order.total, 0)
  }, [orders])

  const activeCustomers = useMemo(() => {
    const ids = new Set(orders.map((order) => order.customerId))
    return ids.size
  }, [orders])

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [],
  )

  if (isLoadingUser) {
    return null
  }

  if (!farmacia) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-primary">Panel de gestión de farmacia</h1>
            <Button onClick={handleLogout} variant="outline" className="gap-2 bg-transparent">
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
          <p className="text-muted-foreground">Bienvenido, {farmacia.nombreFarmacia}</p>
        </header>

        <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pedidos hoy</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todayOrderCount}</div>
              <p className="text-xs text-muted-foreground">Pedidos registrados en las últimas 24 horas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas del mes</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{currencyFormatter.format(monthlySales)}</div>
              <p className="text-xs text-muted-foreground">Total confirmado de pedidos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes activos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCustomers}</div>
              <p className="text-xs text-muted-foreground">Clientes con pedidos registrados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pedidos activos</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeOrders.length}</div>
              <p className="text-xs text-muted-foreground">Incluye pedidos en proceso y aceptados</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="order-2 lg:order-1">
            <CardHeader>
              <CardTitle>Resumen de la farmacia</CardTitle>
              <CardDescription>Datos registrados de tu cuenta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="font-semibold">Nombre: </span>
                {farmacia.nombreFarmacia}
              </div>
              <div>
                <span className="font-semibold">CUIT: </span>
                {farmacia.cuit}
              </div>
              <div>
                <span className="font-semibold">Dirección: </span>
                {farmacia.direccion}
              </div>
              <div>
                <span className="font-semibold">Email: </span>
                {farmacia.email}
              </div>
              {farmacia.telefono && (
                <div>
                  <span className="font-semibold">Teléfono: </span>
                  {farmacia.telefono}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="order-1 lg:order-2">
            <CardHeader>
              <CardTitle>Acciones rápidas</CardTitle>
              <CardDescription>Gestiona la operativa del día</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => loadOrders(farmacia.id, false).catch((error) => console.error(error))}
                disabled={isRefreshing}
              >
                <RefreshCcw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} /> Recargar pedidos
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => router.push("/farmacia/panel/inventario")}
              >
                Gestionar inventario
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <header className="space-y-2">
            <h2 className="text-2xl font-semibold">Pedidos</h2>
            <p className="text-sm text-muted-foreground">
              Gestiona los pedidos entrantes y marca los que estén listos para repartidor.
            </p>
          </header>

          {fetchError && (
            <Alert variant="destructive">
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}

          {isLoadingOrders ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">Cargando pedidos...</CardContent>
            </Card>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aún no se registraron pedidos.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {activeOrders.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Pedidos activos ({activeOrders.length})</h3>
                  <div className="space-y-4">
                    {activeOrders.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        onUpdateStatus={updateOrderStatus}
                        isBusy={pendingOrderId === order.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {completedOrders.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Historial ({completedOrders.length})</h3>
                  <div className="space-y-4">
                    {completedOrders.map((order) => (
                      <OrderRow key={order.id} order={order} onUpdateStatus={updateOrderStatus} isBusy={pendingOrderId === order.id} disabledActions={true} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

interface OrderRowProps {
  order: OrderWithItems
  onUpdateStatus: (orderId: string, nextStatus: OrderStatus) => Promise<void>
  isBusy: boolean
  disabledActions?: boolean
}

function OrderRow({ order, onUpdateStatus, isBusy, disabledActions }: OrderRowProps) {
  const statusLabel = STATUS_LABELS[order.status]
  const badgeClass = STATUS_COLORS[order.status]
  const handleOpenPrescription = () => {
    if (!order.prescriptionFileUrl) {
      window.alert("La receta aún no está disponible para descargar.")
      return
    }
    window.open(order.prescriptionFileUrl, "_blank", "noopener,noreferrer")
  }

  const canAccept = order.status === "processing" && !disabledActions
  const canCancel = ACTIONABLE_STATUSES.includes(order.status) && !disabledActions

  return (
    <Card className="shadow-sm">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Pedido #{order.orderNumber}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Recibido el {new Date(order.createdAt ?? order.date).toLocaleString("es-AR")}
            </p>
          </div>
          <Badge className={badgeClass}>{statusLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p className="font-medium">Cliente</p>
            <p className="text-muted-foreground">ID: {order.customerId}</p>
            <p className="text-muted-foreground">Dirección: {order.deliveryAddress}</p>
            {order.deliveryInstructions && (
              <p className="text-muted-foreground">Indicaciones: {order.deliveryInstructions}</p>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">Pago</p>
            <p className="text-muted-foreground">Método: {order.paymentMethod}</p>
            <p className="text-muted-foreground">Total: ${order.total.toLocaleString()}</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-medium">Productos</p>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={`${order.id}-${item.medicationId}`} className="flex items-center justify-between rounded border bg-muted/40 p-3">
                <div>
                  <p className="font-medium">{item.medicationName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.brand ? `${item.brand} - ` : ""}Cantidad: {item.quantity}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">${item.finalPrice.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {(order.prescriptionRequired || order.prescriptionUploaded || order.prescriptionFileName) && (
          <div className="space-y-3 rounded border bg-muted/40 p-3 text-sm">
            <div className="inline-flex items-center gap-2 font-medium">
              <FileText className="h-4 w-4" />
              <span>Receta médica</span>
            </div>
            {order.prescriptionRejectionReason && (
              <p className="text-xs text-red-700">Motivo: {order.prescriptionRejectionReason}</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span>Archivo:</span>
                <span>{order.prescriptionFileName || "No informado"}</span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-60"
                onClick={handleOpenPrescription}
                disabled={!order.prescriptionFileUrl}
              >
                Ver receta
              </Button>
            </div>
            {!order.prescriptionFileUrl && (
              <p className="text-xs text-muted-foreground">Archivo no disponible</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canAccept && (
            <Button
              size="sm"
              variant="default"
              onClick={() => onUpdateStatus(order.id, "accepted")}
              disabled={isBusy}
              className="inline-flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" /> Aceptar pedido
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onUpdateStatus(order.id, "cancelled")}
              disabled={isBusy}
              className="inline-flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" /> Cancelar
            </Button>
          )}
          {!canAccept && !canCancel && (
            <div className="inline-flex items-center gap-2 rounded border border-dashed px-3 py-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> Sin acciones disponibles
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
