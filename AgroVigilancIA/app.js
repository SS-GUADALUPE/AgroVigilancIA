// Variables globales
let stream = null;
let videoElement = null;
let canvas = null;
let imagenManual = null;
let historialPagina = 1;
let historialPorPagina = 10;

// Configuración de Roboflow
let configRoboflow = {
    apiKey: localStorage.getItem('roboflow_api_key') || '',
    modelId: localStorage.getItem('roboflow_model_id') || '',
    version: localStorage.getItem('roboflow_version') || '1'
};

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', function() {
    inicializarElementos();
    cargarConfiguracion();
    cargarHistorial();
    configurarEventListeners();
});

function inicializarElementos() {
    videoElement = document.getElementById('video-preview');
    canvas = document.getElementById('canvas-capture');
}

function configurarEventListeners() {
    // Navegación entre secciones
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Controles de cámara
    document.getElementById('activar-camara').addEventListener('click', activarCamara);
    document.getElementById('desactivar-camara').addEventListener('click', desactivarCamara);
    document.getElementById('capturar-imagen').addEventListener('click', capturarImagen);

    // Upload manual
    const fileInput = document.getElementById('file-input');
    const dropArea = document.getElementById('drop-area');
    
    fileInput.addEventListener('change', manejarSeleccionArchivo);
    document.getElementById('analizar-imagen').addEventListener('click', analizarImagenManual);
    
    // Drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, prevenirComportamiento, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, resaltarArea, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, desresaltarArea, false);
    });

    dropArea.addEventListener('drop', manejarDrop, false);

    // Historial
    document.getElementById('filtro-tipo').addEventListener('change', filtrarHistorial);
    document.getElementById('filtro-fecha').addEventListener('change', filtrarHistorial);
    document.getElementById('btn-refrescar').addEventListener('click', cargarHistorial);
    document.getElementById('btn-anterior').addEventListener('click', paginaAnterior);
    document.getElementById('btn-siguiente').addEventListener('click', paginaSiguiente);

    // Configuración
    document.getElementById('guardar-config').addEventListener('click', guardarConfiguracion);
    document.getElementById('probar-config').addEventListener('click', probarConexionRoboflow);

    // Modal
    document.querySelector('.cerrar-modal').addEventListener('click', cerrarModal);
    window.addEventListener('click', function(event) {
        if (event.target === document.getElementById('modal-detalle')) {
            cerrarModal();
        }
    });
}

// ==================== FUNCIONES DE CÁMARA ====================
async function activarCamara() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        
        videoElement.srcObject = stream;
        
        // Habilitar/deshabilitar botones
        document.getElementById('activar-camara').disabled = true;
        document.getElementById('desactivar-camara').disabled = false;
        document.getElementById('capturar-imagen').disabled = false;
        
        mostrarNotificacion('Cámara activada correctamente', 'success');
    } catch (error) {
        console.error("Error al acceder a la cámara:", error);
        mostrarNotificacion('Error al acceder a la cámara. Verifica los permisos.', 'error');
    }
}

function desactivarCamara() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        
        // Habilitar/deshabilitar botones
        document.getElementById('activar-camara').disabled = false;
        document.getElementById('desactivar-camara').disabled = true;
        document.getElementById('capturar-imagen').disabled = true;
        
        mostrarNotificacion('Cámara desactivada', 'info');
    }
}

function capturarImagen() {
    if (!stream) {
        mostrarNotificacion('Primero activa la cámara', 'warning');
        return;
    }
    
    const context = canvas.getContext('2d');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // Convertir a base64
    const imagenBase64 = canvas.toDataURL('image/jpeg', 0.8);
    
    // Mostrar captura
    document.getElementById('resultado-automatica').innerHTML = `
        <div class="cargando">
            <i class="fas fa-spinner fa-spin"></i> Analizando imagen...
        </div>
    `;
    
    // Analizar con Roboflow
    analizarConRoboflow(imagenBase64, 'automatica');
}

// ==================== FUNCIONES DE UPLOAD MANUAL ====================
function prevenirComportamiento(e) {
    e.preventDefault();
    e.stopPropagation();
}

function resaltarArea() {
    document.getElementById('drop-area').classList.add('dragover');
}

function desresaltarArea() {
    document.getElementById('drop-area').classList.remove('dragover');
}

function manejarDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        procesarArchivo(files[0]);
    }
}

function manejarSeleccionArchivo(e) {
    if (e.target.files.length > 0) {
        procesarArchivo(e.target.files[0]);
    }
}

function procesarArchivo(file) {
    // Validar extensión
    const extensionesPermitidas = ['jpg', 'jpeg', 'png', 'webp'];
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (!extensionesPermitidas.includes(extension)) {
        mostrarNotificacion('Formato no permitido. Solo JPG, PNG o WEBP.', 'error');
        return;
    }
    
    // Validar tamaño (5MB máximo)
    if (file.size > 5 * 1024 * 1024) {
        mostrarNotificacion('El archivo es demasiado grande. Máximo 5MB.', 'error');
        return;
    }
    
    // Mostrar preview
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewContainer = document.getElementById('preview-container');
        previewContainer.innerHTML = `
            <div class="imagen-preview">
                <img src="${e.target.result}" alt="Vista previa">
                <p>${file.name} (${(file.size / 1024).toFixed(2)} KB)</p>
                <button onclick="eliminarPreview()" class="btn btn-danger btn-sm">
                    <i class="fas fa-times"></i> Eliminar
                </button>
            </div>
        `;
        imagenManual = e.target.result;
        document.getElementById('analizar-imagen').disabled = false;
    };
    reader.readAsDataURL(file);
}

function eliminarPreview() {
    document.getElementById('preview-container').innerHTML = '';
    document.getElementById('file-input').value = '';
    imagenManual = null;
    document.getElementById('analizar-imagen').disabled = true;
}

function analizarImagenManual() {
    if (!imagenManual) {
        mostrarNotificacion('Por favor, selecciona una imagen primero.', 'warning');
        return;
    }
    
    document.getElementById('resultado-manual').innerHTML = `
        <div class="cargando">
            <i class="fas fa-spinner fa-spin"></i> Analizando imagen...
        </div>
    `;
    
    analizarConRoboflow(imagenManual, 'manual');
}

// ==================== FUNCIONES DE ANÁLISIS ROBOFLOW ====================
async function analizarConRoboflow(imagenBase64, tipoDeteccion) {
    if (!configRoboflow.apiKey || !configRoboflow.modelId) {
        mostrarNotificacion('Configura primero la API de Roboflow en Configuración', 'error');
        return;
    }
    
    const base64Data = imagenBase64.replace(/^data:image\/\w+;base64,/, '');
    
    try {
        const response = await fetch(
            `https://detect.roboflow.com/${configRoboflow.modelId}/${configRoboflow.version}?api_key=${configRoboflow.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: base64Data
            }
        );
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Mostrar resultados
        mostrarResultados(data, tipoDeteccion);
        
        // Guardar en historial
        guardarEnHistorial({
            tipo: tipoDeteccion,
            fecha: new Date().toISOString(),
            imagen: imagenBase64,
            resultados: data.predictions,
            confianza: data.predictions.length > 0 ? 
                     Math.max(...data.predictions.map(p => p.confidence)) : 0
        });
        
        mostrarNotificacion('Análisis completado correctamente', 'success');
        
    } catch (error) {
        console.error('Error en análisis Roboflow:', error);
        
        const resultadoContainer = tipoDeteccion === 'automatica' 
            ? document.getElementById('resultado-automatica')
            : document.getElementById('resultado-manual');
        
        resultadoContainer.innerHTML = `
            <div class="error">
                <i class="fas fa-exclamation-triangle"></i> Error al analizar la imagen.
                <p class="error-detalle">${error.message}</p>
            </div>
        `;
        
        mostrarNotificacion('Error al analizar la imagen', 'error');
    }
}

function mostrarResultados(data, tipo) {
    const containerId = tipo === 'automatica' ? 'resultado-automatica' : 'resultado-manual';
    const container = document.getElementById(containerId);
    
    if (!data.predictions || data.predictions.length === 0) {
        container.innerHTML = `
            <div class="sin-resultados">
                <i class="fas fa-search"></i> No se detectaron plagas en la imagen.
            </div>
        `;
        return;
    }
    
    let html = '<div class="resultados-detalle">';
    html += `<p class="total-detecciones">Se encontraron ${data.predictions.length} plaga(s)</p>`;
    
    data.predictions.forEach((pred, index) => {
        html += `
            <div class="prediccion">
                <div class="prediccion-header">
                    <span class="prediccion-numero">#${index + 1}</span>
                    <span class="prediccion-clase">${pred.class}</span>
                    <span class="prediccion-confianza ${pred.confidence > 0.7 ? 'alta' : pred.confidence > 0.4 ? 'media' : 'baja'}">
                        ${(pred.confidence * 100).toFixed(1)}%
                    </span>
                </div>
                <div class="prediccion-detalles">
                    <div><strong>X:</strong> ${pred.x.toFixed(0)}</div>
                    <div><strong>Y:</strong> ${pred.y.toFixed(0)}</div>
                    <div><strong>Ancho:</strong> ${pred.width.toFixed(0)}</div>
                    <div><strong>Alto:</strong> ${pred.height.toFixed(0)}</div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// ==================== FUNCIONES DE HISTORIAL ====================
function guardarEnHistorial(deteccion) {
    let historial = JSON.parse(localStorage.getItem('historialDetecciones') || '[]');
    
    deteccion.id = Date.now() + Math.random();
    historial.unshift(deteccion);
    
    // Limitar a últimas 200 detecciones
    if (historial.length > 200) {
        historial = historial.slice(0, 200);
    }
    
    localStorage.setItem('historialDetecciones', JSON.stringify(historial));
    
    // Actualizar vista si estamos en la sección de historial
    if (document.getElementById('seccion-historial').classList.contains('seccion-activa')) {
        cargarHistorial();
    }
}

function cargarHistorial() {
    let historial = JSON.parse(localStorage.getItem('historialDetecciones') || '[]');
    
    // Aplicar filtros
    const tipoFiltro = document.getElementById('filtro-tipo').value;
    const fechaFiltro = document.getElementById('filtro-fecha').value;
    
    if (tipoFiltro !== 'todos') {
        historial = historial.filter(item => item.tipo === tipoFiltro);
    }
    
    if (fechaFiltro) {
        historial = historial.filter(item => 
            item.fecha.startsWith(fechaFiltro)
        );
    }
    
    // Paginación
    const totalPaginas = Math.ceil(historial.length / historialPorPagina);
    const inicio = (historialPagina - 1) * historialPorPagina;
    const fin = inicio + historialPorPagina;
    const historialPaginado = historial.slice(inicio, fin);
    
    // Actualizar controles de paginación
    document.getElementById('btn-anterior').disabled = historialPagina <= 1;
    document.getElementById('btn-siguiente').disabled = historialPagina >= totalPaginas;
    document.getElementById('pagina-actual').textContent = `Página ${historialPagina} de ${totalPaginas || 1}`;
    
    // Renderizar tabla
    const tbody = document.getElementById('historial-body');
    
    if (historialPaginado.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="sin-datos">
                    <i class="fas fa-inbox"></i> No hay detecciones registradas
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    historialPaginado.forEach(item => {
        const fecha = new Date(item.fecha).toLocaleString();
        const plagas = item.resultados.map(r => r.class).join(', ') || 'Ninguna';
        const confianza = item.confianza ? (item.confianza * 100).toFixed(1) + '%' : 'N/A';
        
        html += `
            <tr>
                <td>${fecha}</td>
                <td><span class="badge-tipo ${item.tipo}">${item.tipo}</span></td>
                <td>${plagas}</td>
                <td>
                    <div class="barra-confianza">
                        <div class="barra-progreso" style="width: ${item.confianza * 100}%"></div>
                        <span>${confianza}</span>
                    </div>
                </td>
                <td>
                    <button onclick="verDetalle(${item.id})" class="btn-accion btn-ver">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="eliminarDeteccion(${item.id})" class="btn-accion btn-eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function filtrarHistorial() {
    historialPagina = 1;
    cargarHistorial();
}

function paginaAnterior() {
    if (historialPagina > 1) {
        historialPagina--;
        cargarHistorial();
    }
}

function paginaSiguiente() {
    let historial = JSON.parse(localStorage.getItem('historialDetecciones') || '[]');
    const totalPaginas = Math.ceil(historial.length / historialPorPagina);
    
    if (historialPagina < totalPaginas) {
        historialPagina++;
        cargarHistorial();
    }
}

function verDetalle(id) {
    const historial = JSON.parse(localStorage.getItem('historialDetecciones') || '[]');
    const deteccion = historial.find(item => item.id === id);
    
    if (!deteccion) return;
    
    const fecha = new Date(deteccion.fecha).toLocaleString();
    let html = `
        <div class="detalle-header">
            <div class="detalle-fecha">${fecha}</div>
            <div class="detalle-tipo ${deteccion.tipo}">${deteccion.tipo}</div>
        </div>
        
        <div class="detalle-imagen">
            <img src="${deteccion.imagen}" alt="Imagen analizada">
        </div>
        
        <div class="detalle-resultados">
            <h4>Resultados del Análisis:</h4>
    `;
    
    if (deteccion.resultados && deteccion.resultados.length > 0) {
        deteccion.resultados.forEach((pred, index) => {
            html += `
                <div class="detalle-prediccion">
                    <div class="prediccion-info">
                        <span class="pred-clase">${pred.class}</span>
                        <span class="pred-confianza">${(pred.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div class="pred-coordenadas">
                        X:${pred.x.toFixed(0)} Y:${pred.y.toFixed(0)} 
                        (${pred.width.toFixed(0)}×${pred.height.toFixed(0)})
                    </div>
                </div>
            `;
        });
    } else {
        html += '<p class="sin-resultados">No se detectaron plagas</p>';
    }
    
    html += `</div>`;
    
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-detalle').classList.add('mostrar');
}

function eliminarDeteccion(id) {
    if (confirm('¿Estás seguro de eliminar esta detección del historial?')) {
        let historial = JSON.parse(localStorage.getItem('historialDetecciones') || '[]');
        historial = historial.filter(item => item.id !== id);
        localStorage.setItem('historialDetecciones', JSON.stringify(historial));
        
        mostrarNotificacion('Detección eliminada del historial', 'success');
        cargarHistorial();
    }
}

// ==================== FUNCIONES DE CONFIGURACIÓN ====================
function cargarConfiguracion() {
    document.getElementById('api-key').value = configRoboflow.apiKey;
    document.getElementById('model-id').value = configRoboflow.modelId;
    document.getElementById('version').value = configRoboflow.version;
    
    actualizarEstadoConfiguracion();
}

function guardarConfiguracion() {
    const apiKey = document.getElementById('api-key').value.trim();
    const modelId = document.getElementById('model-id').value.trim();
    const version = document.getElementById('version').value.trim();
    
    if (!apiKey || !modelId) {
        mostrarNotificacion('API Key y Model ID son requeridos', 'error');
        return;
    }
    
    configRoboflow = { apiKey, modelId, version: version || '1' };
    
    // Guardar en localStorage
    localStorage.setItem('roboflow_api_key', apiKey);
    localStorage.setItem('roboflow_model_id', modelId);
    localStorage.setItem('roboflow_version', version || '1');
    
    actualizarEstadoConfiguracion();
    mostrarNotificacion('Configuración guardada correctamente', 'success');
}

async function probarConexionRoboflow() {
    if (!configRoboflow.apiKey || !configRoboflow.modelId) {
        mostrarNotificacion('Configura primero la API de Roboflow', 'error');
        return;
    }
    
    mostrarNotificacion('Probando conexión con Roboflow...', 'info');
    
    try {
        // Hacer una solicitud de prueba simple a Roboflow
        const response = await fetch(
            `https://api.roboflow.com/${configRoboflow.modelId}?api_key=${configRoboflow.apiKey}`
        );
        
        if (response.ok) {
            document.getElementById('estado-api').textContent = 'Conectado';
            document.getElementById('estado-api').className = 'estado conectado';
            document.getElementById('estado-modelo').textContent = configRoboflow.modelId;
            
            mostrarNotificacion('Conexión exitosa con Roboflow API', 'success');
        } else {
            throw new Error('Error en la respuesta');
        }
    } catch (error) {
        document.getElementById('estado-api').textContent = 'Error de conexión';
        document.getElementById('estado-api').className = 'estado desconectado';
        
        mostrarNotificacion('Error al conectar con Roboflow API', 'error');
    }
}

function actualizarEstadoConfiguracion() {
    const estadoApi = document.getElementById('estado-api');
    const estadoModelo = document.getElementById('estado-modelo');
    
    if (configRoboflow.apiKey && configRoboflow.modelId) {
        estadoApi.textContent = 'Configurado';
        estadoApi.className = 'estado conectado';
        estadoModelo.textContent = configRoboflow.modelId;
    } else {
        estadoApi.textContent = 'No configurado';
        estadoApi.className = 'estado desconectado';
        estadoModelo.textContent = 'No configurado';
    }
}

// ==================== FUNCIONES AUXILIARES ====================
function mostrarSeccion(seccionId) {
    // Ocultar todas las secciones
    document.getElementById('seccion-deteccion').classList.remove('seccion-activa');
    document.getElementById('seccion-deteccion').classList.add('seccion-oculta');
    
    document.getElementById('seccion-historial').classList.remove('seccion-activa');
    document.getElementById('seccion-historial').classList.add('seccion-oculta');
    
    document.getElementById('seccion-config').classList.remove('seccion-activa');
    document.getElementById('seccion-config').classList.add('seccion-oculta');
    
    // Mostrar la sección seleccionada
    document.getElementById(`seccion-${seccionId}`).classList.remove('seccion-oculta');
    document.getElementById(`seccion-${seccionId}`).classList.add('seccion-activa');
    
    // Si es historial, cargarlo
    if (seccionId === 'historial') {
        cargarHistorial();
    }
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    // Crear notificación
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion notificacion-${tipo}`;
    notificacion.innerHTML = `
        <i class="fas fa-${tipo === 'success' ? 'check-circle' : tipo === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${mensaje}</span>
    `;
    
    // Estilos de notificación
    notificacion.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${tipo === 'success' ? '#4CAF50' : tipo === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 3000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
    `;
    
    document.body.appendChild(notificacion);
    
    // Remover después de 5 segundos
    setTimeout(() => {
        notificacion.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notificacion.parentNode) {
                notificacion.parentNode.removeChild(notificacion);
            }
        }, 300);
    }, 5000);
}

function cerrarModal() {
    document.getElementById('modal-detalle').classList.remove('mostrar');
}

// Agregar animaciones CSS dinámicamente
const estiloAnimaciones = document.createElement('style');
estiloAnimaciones.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .notificacion {
        font-family: 'Poppins', sans-serif;
    }
    
    .badge-tipo {
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .badge-tipo.automatica {
        background: #e3f2fd;
        color: #1976d2;
    }
    
    .badge-tipo.manual {
        background: #f3e5f5;
        color: #7b1fa2;
    }
    
    .barra-confianza {
        height: 24px;
        background: #f0f0f0;
        border-radius: 12px;
        position: relative;
        overflow: hidden;
    }
    
    .barra-progreso {
        height: 100%;
        background: linear-gradient(90deg, #4CAF50, #8BC34A);
        border-radius: 12px;
        transition: width 0.3s ease;
    }
    
    .barra-confianza span {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
        font-weight: 500;
    }
    
    .btn-accion {
        padding: 6px 10px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        margin: 0 2px;
    }
    
    .btn-ver {
        background: #e3f2fd;
        color: #1976d2;
    }
    
    .btn-eliminar {
        background: #ffebee;
        color: #d32f2f;
    }
    
    .sin-datos {
        text-align: center;
        padding: 40px !important;
        color: #888;
    }
    
    .sin-datos i {
        font-size: 2rem;
        margin-bottom: 10px;
        display: block;
    }
    
    .cargando {
        text-align: center;
        padding: 40px;
        color: #666;
    }
    
    .fa-spin {
        animation: fa-spin 1s infinite linear;
    }
    
    @keyframes fa-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .error {
        color: #d32f2f;
        text-align: center;
        padding: 20px;
    }
    
    .error-detalle {
        font-size: 0.9rem;
        margin-top: 10px;
        color: #666;
    }
    
    .prediccion-confianza.alta { color: #4CAF50; }
    .prediccion-confianza.media { color: #FF9800; }
    .prediccion-confianza.baja { color: #f44336; }
    
    .prediccion-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }
    
    .prediccion-detalles {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        font-size: 0.9rem;
        color: #666;
    }
    
    .detalle-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 2px solid #f0f0f0;
    }
    
    .detalle-imagen {
        margin: 20px 0;
        text-align: center;
    }
    
    .detalle-imagen img {
        max-width: 100%;
        max-height: 300px;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .detalle-resultados {
        margin-top: 20px;
    }
    
    .detalle-prediccion {
        background: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 10px;
    }
    
    .prediccion-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }
    
    .pred-clase {
        font-weight: 600;
        color: #2c3e50;
    }
    
    .pred-confianza {
        background: #4CAF50;
        color: white;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 0.9rem;
    }
    
    .pred-coordenadas {
        font-size: 0.9rem;
        color: #666;
    }
`;
document.head.appendChild(estiloAnimaciones);

// Inicializar con sección de detección
mostrarSeccion('deteccion');