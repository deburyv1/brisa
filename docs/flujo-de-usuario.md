# Flujo de usuario de Brisa

## Propósito

Brisa acompaña a la persona desde que algo aparece en su mente hasta que lo
resuelve, lo transforma o decide cuándo retomarlo. Debe reducir la carga de
recordar, priorizar e iniciar; no añadir otra rutina de administración. Diseñar
para disfunción ejecutiva alta, TDAH y TEA sin asumir que todas las personas
necesitan lo mismo.

## Un día normal

1. **Capturar sin fricción.** Un campo disponible desde cualquier vista recibe
   texto libre. Brisa guarda primero; clasificar, fechar y estimar son opcionales.
2. **Orientarse en segundos.** Inicio muestra una acción recomendada, por qué
   toca ahora y un resumen verificable de vencidas, hoy y próximos siete días.
   La persona puede elegir otra sin recorrer una lista larga.
3. **Empezar con ayuda proporcional.** Al abrir una acción, Brisa usa título,
   notas, fechas, evento asociado e historial para proponer un paso, checklist o
   análisis. Si falta contexto, hace una pregunta breve. Nunca inicia un timer
   sin algo concreto que hacer.
4. **Acompañar sin encerrar.** Enfoque permite continuar, marcar un paso,
   pausar, retomar, reducir el alcance o programar. Cada cambio conserva lo ya
   capturado y el vínculo con su evento o acción original.
5. **Preparar los eventos a tiempo.** Cada evento distingue preparación previa
   de acciones que corresponden al mismo día. Una rutina de salida reusable
   (llaves, mochila, documentos u otras elegidas por la persona) se puede
   adjuntar con un toque. Brisa reúne esas tareas antes de salir, junto con
   tiempo y lugar, sin mezclarlas con el checklist del evento.
6. **Permitir que las cosas muten.** Una idea puede pasar a acción; una nota,
   pensamiento; una acción, evento o recordatorio. La conversión conserva texto,
   contexto, fechas y referencia al origen, y explica cualquier dato que falte.
7. **Cerrar y volver.** Al terminar o volver después de una pausa, Brisa resume
   el progreso y ofrece una sola decisión: seguir, hacer más pequeño, reubicar,
   esperar a alguien o cerrar. No usa rachas ni reproches.

## Reglas de priorización

- Respetar primero compromisos con fecha y vencimientos reales; después, lo que
  desbloquea otras cosas y las acciones breves que caben ahora.
- No recomendar como “siguiente” un paso de checklist o una preparación de
  evento que ya tenga un contenedor propio.
- Mostrar cuántos elementos quedan fuera de la selección y de qué período son;
  no dar a entender que la acción recomendada es lo único pendiente.
- Si hay varias opciones parecidas, explicar el criterio con lenguaje simple.
- Ofrecer “hacerlo ahora” cuando una acción quedó atrás y permitir reprogramar
  para este momento antes de abrir Enfoque.

## Jerarquía de pantallas

- **Inicio:** una recomendación principal, panorama temporal compacto y eventos
  que requieren preparación; lo secundario queda plegado.
- **Inbox:** capturas sin procesar con sugerencia reversible y conversión
  accesible sin abrir varios formularios.
- **Acciones / Enfoque:** un siguiente movimiento visible; detalles y checklist
  aparecen cuando ayudan a esa acción.
- **Calendario / Eventos:** compromisos y preparación en el momento correcto;
  separar “antes”, “ese día” y “al salir”.
- **Ideas / Notas / Hábitos / Compras / Finanzas / Relaciones:** conservar sus
  herramientas específicas, compartir controles y patrones visuales, y ofrecer
  acciones rápidas que eviten formularios largos.

## Apariencia y carga cognitiva

- Mantener la identidad Aero de Brisa con superficies más legibles, menos
  resplandor detrás del texto, contraste suficiente y un ritmo de espaciado
  común.
- Una acción principal por panel; acciones destructivas separadas y nombradas.
- Formularios con valores por defecto, campos opcionales explícitos, etiquetas
  persistentes y errores junto al campo que los provoca.
- Modales cortos; las tareas largas pasan a una vista o panel amplio. En móvil,
  usar hojas inferiores con controles alcanzables y cierre consistente.
- Mantener estados de carga, vacío, error y confirmación con el mismo lenguaje.
- Animación discreta, compatible con `prefers-reduced-motion`; conservar el
  gráfico de avance diario.

## Módulos y personalización

Los módulos base generalizables (Inicio, Inbox, Acciones, Notas, Calendario,
Finanzas, Relaciones, Compras, Hábitos, Ideas, Estudio, Enfoque y Papelera) están
disponibles para cada cuenta nueva. Herramientas personales como Clips RL se
habilitan como función opcional por cuenta y se protegen también en el servidor;
ocultar un botón no es control de acceso.

## Orden de implementación

1. Aislamiento por cuenta y catálogo de funciones opcionales.
2. Shell visual compartido y estados consistentes en todas las vistas.
3. Inicio, captura e Inbox como entrada cotidiana de baja fricción.
4. Enfoque y ciclo de vida de acciones.
5. Eventos y rutina de salida con preparación por fase.
6. Conversión contextual entre tipos y accesos rápidos en los demás módulos.
7. Revisión visual por vista, teclado, móvil, estados vacíos y errores.

El éxito se mide por menos pantallas y decisiones para llegar al siguiente paso,
por capturas que no se pierden y por poder retomar con claridad, no por cantidad
de datos rellenados ni por rachas.
