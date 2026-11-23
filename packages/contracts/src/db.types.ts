
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "devices": {
                  Row: {
                    "enrolled_at": string,"last_seen": string | null,"member_id": string,"revoked_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enrolled_at"?: string,"last_seen"?: string | null,"member_id": string,"revoked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "enrolled_at"?: string,"last_seen"?: string | null,"member_id"?: string,"revoked_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "devices_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"dish": {
                  Row: {
                    "hash": string,"id": string,"menu_day_id": string,"momento": string,"olla_id": string,"titulo": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "hash": string,"id"?: string,"menu_day_id": string,"momento": string,"olla_id": string,"titulo": string,"version"?: number
                  }
                  Update: {
                    "hash"?: string,"id"?: string,"menu_day_id"?: string,"momento"?: string,"olla_id"?: string,"titulo"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "dish_menu_day_id_fkey"
      columns: ["menu_day_id"]
isOneToOne: false
      referencedRelation: "menu_day"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dish_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"evento_sync": {
                  Row: {
                    "creado_en": string,"device_id": string,"entidad": string,"estado": string,"event_uuid": string,"idempotency_key": string,"lamport": number,"olla_id": string,"payload": NonNullable<Json>,"recibido_en": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en": string,"device_id": string,"entidad": string,"estado"?: string,"event_uuid": string,"idempotency_key": string,"lamport": number,"olla_id": string,"payload": NonNullable<Json>,"recibido_en"?: string
                  }
                  Update: {
                    "creado_en"?: string,"device_id"?: string,"entidad"?: string,"estado"?: string,"event_uuid"?: string,"idempotency_key"?: string,"lamport"?: number,"olla_id"?: string,"payload"?: NonNullable<Json>,"recibido_en"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "evento_sync_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"ingredient": {
                  Row: {
                    "dish_id": string,"gramos": number | null,"hash": string,"id": string,"insumo_id": string,"olla_id": string,"unidad": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "dish_id": string,"gramos"?: number | null,"hash": string,"id"?: string,"insumo_id": string,"olla_id": string,"unidad": string,"version"?: number
                  }
                  Update: {
                    "dish_id"?: string,"gramos"?: number | null,"hash"?: string,"id"?: string,"insumo_id"?: string,"olla_id"?: string,"unidad"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredient_dish_id_fkey"
      columns: ["dish_id"]
isOneToOne: false
      referencedRelation: "dish"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ingredient_insumo_id_fkey"
      columns: ["insumo_id"]
isOneToOne: false
      referencedRelation: "insumos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ingredient_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"insumos": {
                  Row: {
                    "alergenos": (string)[],"created_at": string,"deleted_at": string | null,"denominacion": string,"device_id": string,"gramos_por_unidad": number | null,"grupo": string,"id": string,"lamport": number,"olla_id": string,"perecedero": boolean,"stock_minimo": number,"unidad_base": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alergenos"?: (string)[],"created_at"?: string,"deleted_at"?: string | null,"denominacion": string,"device_id": string,"gramos_por_unidad"?: number | null,"grupo": string,"id": string,"lamport"?: number,"olla_id": string,"perecedero"?: boolean,"stock_minimo"?: number,"unidad_base": string,"updated_at"?: string
                  }
                  Update: {
                    "alergenos"?: (string)[],"created_at"?: string,"deleted_at"?: string | null,"denominacion"?: string,"device_id"?: string,"gramos_por_unidad"?: number | null,"grupo"?: string,"id"?: string,"lamport"?: number,"olla_id"?: string,"perecedero"?: boolean,"stock_minimo"?: number,"unidad_base"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "insumos_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "creado_en": string,"id": string,"pin_hash": string,"recovery_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"id"?: string,"pin_hash": string,"recovery_hash": string
                  }
                  Update: {
                    "creado_en"?: string,"id"?: string,"pin_hash"?: string,"recovery_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"menu_constraint": {
                  Row: {
                    "hash": string,"id": string,"motivo": string | null,"olla_id": string,"template_id": string,"tipo": string,"valor": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "hash": string,"id"?: string,"motivo"?: string | null,"olla_id": string,"template_id": string,"tipo": string,"valor": string,"version"?: number
                  }
                  Update: {
                    "hash"?: string,"id"?: string,"motivo"?: string | null,"olla_id"?: string,"template_id"?: string,"tipo"?: string,"valor"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_constraint_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_constraint_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "menu_template"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_day": {
                  Row: {
                    "dia_semana": number,"fecha": string | null,"hash": string,"id": string,"olla_id": string,"template_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "dia_semana": number,"fecha"?: string | null,"hash": string,"id"?: string,"olla_id": string,"template_id": string,"version"?: number
                  }
                  Update: {
                    "dia_semana"?: number,"fecha"?: string | null,"hash"?: string,"id"?: string,"olla_id"?: string,"template_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_day_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_day_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "menu_template"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_template": {
                  Row: {
                    "created_at": string,"estado": string,"hash": string,"id": string,"olla_id": string,"opcion": string,"perfil": string,"sello_cnp": string | null,"sello_fecha": string | null,"sello_nutricionista": string | null,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"estado"?: string,"hash": string,"id"?: string,"olla_id": string,"opcion": string,"perfil": string,"sello_cnp"?: string | null,"sello_fecha"?: string | null,"sello_nutricionista"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"estado"?: string,"hash"?: string,"id"?: string,"olla_id"?: string,"opcion"?: string,"perfil"?: string,"sello_cnp"?: string | null,"sello_fecha"?: string | null,"sello_nutricionista"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_template_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"movimientos": {
                  Row: {
                    "at": string,"autor": string,"created_at": string,"deleted_at": string | null,"delta": number,"device_id": string,"id": string,"insumo_id": string,"lamport": number,"motivo": string,"olla_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at": string,"autor": string,"created_at"?: string,"deleted_at"?: string | null,"delta": number,"device_id": string,"id"?: string,"insumo_id": string,"lamport"?: number,"motivo": string,"olla_id": string,"updated_at"?: string
                  }
                  Update: {
                    "at"?: string,"autor"?: string,"created_at"?: string,"deleted_at"?: string | null,"delta"?: number,"device_id"?: string,"id"?: string,"insumo_id"?: string,"lamport"?: number,"motivo"?: string,"olla_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_insumo_id_fkey"
      columns: ["insumo_id"]
isOneToOne: false
      referencedRelation: "insumos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"olla_members": {
                  Row: {
                    "member_id": string,"olla_id": string,"rol": string
                  }
                  ComputedFields: never
                  Insert: {
                    "member_id": string,"olla_id": string,"rol": string
                  }
                  Update: {
                    "member_id"?: string,"olla_id"?: string,"rol"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "olla_members_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "olla_members_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"ollas": {
                  Row: {
                    "codigo": string,"creada_en": string,"distrito": string | null,"id": string,"tipo": string,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"creada_en"?: string,"distrito"?: string | null,"id"?: string,"tipo"?: string,"titulo": string
                  }
                  Update: {
                    "codigo"?: string,"creada_en"?: string,"distrito"?: string | null,"id"?: string,"tipo"?: string,"titulo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"personas": {
                  Row: {
                    "anemia": string,"anio_nacimiento": number,"categoria": string,"codigo_p": string,"consentimiento_seguimiento": boolean,"created_at": string,"deleted_at": string | null,"device_id": string,"lamport": number,"notas": string | null,"olla_id": string,"peso_kg": number | null,"sexo": string,"talla_cm": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anemia"?: string,"anio_nacimiento": number,"categoria": string,"codigo_p": string,"consentimiento_seguimiento"?: boolean,"created_at"?: string,"deleted_at"?: string | null,"device_id": string,"lamport"?: number,"notas"?: string | null,"olla_id": string,"peso_kg"?: number | null,"sexo": string,"talla_cm"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "anemia"?: string,"anio_nacimiento"?: number,"categoria"?: string,"codigo_p"?: string,"consentimiento_seguimiento"?: boolean,"created_at"?: string,"deleted_at"?: string | null,"device_id"?: string,"lamport"?: number,"notas"?: string | null,"olla_id"?: string,"peso_kg"?: number | null,"sexo"?: string,"talla_cm"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personas_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"portion": {
                  Row: {
                    "cantidad": number,"dish_id": string,"grupo": string,"hash": string,"id": string,"olla_id": string,"unidad": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"dish_id": string,"grupo": string,"hash": string,"id"?: string,"olla_id": string,"unidad": string,"version"?: number
                  }
                  Update: {
                    "cantidad"?: number,"dish_id"?: string,"grupo"?: string,"hash"?: string,"id"?: string,"olla_id"?: string,"unidad"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "portion_dish_id_fkey"
      columns: ["dish_id"]
isOneToOne: false
      referencedRelation: "dish"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portion_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"precios": {
                  Row: {
                    "canal": string,"created_at": string,"fecha": string,"fuente": string,"id": string,"insumo_id": string,"olla_id": string,"precio": number,"unidad": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canal": string,"created_at"?: string,"fecha": string,"fuente": string,"id"?: string,"insumo_id": string,"olla_id": string,"precio": number,"unidad": string,"url"?: string | null
                  }
                  Update: {
                    "canal"?: string,"created_at"?: string,"fecha"?: string,"fuente"?: string,"id"?: string,"insumo_id"?: string,"olla_id"?: string,"precio"?: number,"unidad"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "precios_insumo_id_fkey"
      columns: ["insumo_id"]
isOneToOne: false
      referencedRelation: "insumos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "precios_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"servicios": {
                  Row: {
                    "cocido_a_75c": boolean,"created_at": string,"deleted_at": string | null,"device_id": string,"fecha": string,"id": string,"inocuidad_verificada_en": string | null,"lamport": number,"menu_day_id": string | null,"olla_id": string,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cocido_a_75c"?: boolean,"created_at"?: string,"deleted_at"?: string | null,"device_id": string,"fecha": string,"id"?: string,"inocuidad_verificada_en"?: string | null,"lamport"?: number,"menu_day_id"?: string | null,"olla_id": string,"tipo": string,"updated_at"?: string
                  }
                  Update: {
                    "cocido_a_75c"?: boolean,"created_at"?: string,"deleted_at"?: string | null,"device_id"?: string,"fecha"?: string,"id"?: string,"inocuidad_verificada_en"?: string | null,"lamport"?: number,"menu_day_id"?: string | null,"olla_id"?: string,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "servicios_menu_day_id_fkey"
      columns: ["menu_day_id"]
isOneToOne: false
      referencedRelation: "menu_day"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "servicios_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"solicitud_items": {
                  Row: {
                    "cantidad": number,"insumo_id": string,"nota": string | null,"solicitud_id": string,"unidad": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"insumo_id": string,"nota"?: string | null,"solicitud_id": string,"unidad": string
                  }
                  Update: {
                    "cantidad"?: number,"insumo_id"?: string,"nota"?: string | null,"solicitud_id"?: string,"unidad"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "solicitud_items_insumo_id_fkey"
      columns: ["insumo_id"]
isOneToOne: false
      referencedRelation: "insumos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "solicitud_items_solicitud_id_fkey"
      columns: ["solicitud_id"]
isOneToOne: false
      referencedRelation: "solicitudes"
      referencedColumns: ["id"]
    }
                  ]
                },"solicitudes": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"device_id": string,"estado": string,"id": string,"lamport": number,"olla_destino_id": string,"olla_origen_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"device_id": string,"estado"?: string,"id"?: string,"lamport"?: number,"olla_destino_id": string,"olla_origen_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"device_id"?: string,"estado"?: string,"id"?: string,"lamport"?: number,"olla_destino_id"?: string,"olla_origen_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "solicitudes_olla_destino_id_fkey"
      columns: ["olla_destino_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "solicitudes_olla_origen_id_fkey"
      columns: ["olla_origen_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"substitution": {
                  Row: {
                    "aprobada_por": string,"factor": number,"hash": string,"id": string,"insumo_destino_id": string,"insumo_origen_id": string,"olla_id": string,"template_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "aprobada_por": string,"factor": number,"hash": string,"id"?: string,"insumo_destino_id": string,"insumo_origen_id": string,"olla_id": string,"template_id": string,"version"?: number
                  }
                  Update: {
                    "aprobada_por"?: string,"factor"?: number,"hash"?: string,"id"?: string,"insumo_destino_id"?: string,"insumo_origen_id"?: string,"olla_id"?: string,"template_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "substitution_insumo_destino_id_fkey"
      columns: ["insumo_destino_id"]
isOneToOne: false
      referencedRelation: "insumos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "substitution_insumo_origen_id_fkey"
      columns: ["insumo_origen_id"]
isOneToOne: false
      referencedRelation: "insumos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "substitution_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "substitution_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "menu_template"
      referencedColumns: ["id"]
    }
                  ]
                },"validation": {
                  Row: {
                    "cnp": string,"estado": string,"fecha": string,"hallazgos": (string)[],"hash": string,"id": string,"olla_id": string,"template_id": string,"validador": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cnp": string,"estado": string,"fecha"?: string,"hallazgos"?: (string)[],"hash": string,"id"?: string,"olla_id": string,"template_id": string,"validador": string,"version"?: number
                  }
                  Update: {
                    "cnp"?: string,"estado"?: string,"fecha"?: string,"hallazgos"?: (string)[],"hash"?: string,"id"?: string,"olla_id"?: string,"template_id"?: string,"validador"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "validation_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "validation_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "menu_template"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_evento_sync_pull": {
                  Row: {
                    "creado_en": string,"device_id": string,"entidad": string,"estado": string,"event_uuid": string,"idempotency_key": string,"lamport": number,"olla_id": string,"payload": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                           "creado_en"?: string | null,"device_id"?: string | null,"entidad"?: string | null,"estado"?: string | null,"event_uuid"?: string | null,"idempotency_key"?: string | null,"lamport"?: number | null,"olla_id"?: string | null,"payload"?: never
                         }
                        Update: {
                           "creado_en"?: string | null,"device_id"?: string | null,"entidad"?: string | null,"estado"?: string | null,"event_uuid"?: string | null,"idempotency_key"?: string | null,"lamport"?: number | null,"olla_id"?: string | null,"payload"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "evento_sync_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_personas_salud": {
                  Row: {
                    "anemia": string,"anio_nacimiento": number,"categoria": string,"codigo_p": string,"consentimiento_seguimiento": boolean,"olla_id": string,"peso_kg": number | null,"sexo": string,"talla_cm": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                           "anemia"?: string | null,"anio_nacimiento"?: number | null,"categoria"?: string | null,"codigo_p"?: string | null,"consentimiento_seguimiento"?: boolean | null,"olla_id"?: string | null,"peso_kg"?: number | null,"sexo"?: string | null,"talla_cm"?: number | null,"updated_at"?: string | null
                         }
                        Update: {
                           "anemia"?: string | null,"anio_nacimiento"?: number | null,"categoria"?: string | null,"codigo_p"?: string | null,"consentimiento_seguimiento"?: boolean | null,"olla_id"?: string | null,"peso_kg"?: number | null,"sexo"?: string | null,"talla_cm"?: number | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "personas_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_salud_agregado": {
                  Row: {
                    "categoria": string,"con_anemia": number | null,"con_consentimiento": number | null,"con_medida": number | null,"olla_id": string,"personas": number | null,"peso_promedio_kg": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "personas_olla_id_fkey"
      columns: ["olla_id"]
isOneToOne: false
      referencedRelation: "ollas"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
