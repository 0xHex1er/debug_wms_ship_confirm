/**
 * Vue2-Flow Component (Compatible with ahmetkoprulu/Vue2-flow specification)
 * Interactive Node-based Flowchart Component for Vue 2
 */
(function (global) {
  if (typeof global.Vue === 'undefined') {
    console.error('[Vue2-Flow] Vue is not loaded. Please include Vue.js before vue2-flow-component.js');
    return;
  }

  const Vue2Flow = {
    name: 'Vue2Flow',
    props: {
      nodes: {
        type: Array,
        default: () => []
      },
      conns: {
        type: Array,
        default: () => []
      },
      connections: {
        type: Array,
        default: null
      },
      selectedNodeId: {
        type: [String, Number],
        default: null
      },
      grid: {
        type: Boolean,
        default: true
      },
      zoomable: {
        type: Boolean,
        default: true
      },
      pannable: {
        type: Boolean,
        default: true
      },
      draggable: {
        type: Boolean,
        default: true
      },
      showControls: {
        type: Boolean,
        default: true
      },
      minZoom: {
        type: Number,
        default: 0.3
      },
      maxZoom: {
        type: Number,
        default: 2.5
      }
    },
    data() {
      return {
        zoom: 1,
        panX: 40,
        panY: 30,
        isPanning: false,
        panStart: { x: 0, y: 0 },
        draggingNode: null,
        dragOffset: { x: 0, y: 0 },
        hasMoved: false,
        activeNodeId: this.selectedNodeId
      };
    },
    computed: {
      effectiveConns() {
        return this.connections || this.conns || [];
      },
      nodeMap() {
        const map = {};
        this.nodes.forEach(node => {
          map[node.id] = node;
        });
        return map;
      },
      canvasTransform() {
        return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
      }
    },
    watch: {
      selectedNodeId(newVal) {
        this.activeNodeId = newVal;
      }
    },
    methods: {
      // Pan handlers
      onMouseDownCanvas(e) {
        // Only pan if left click or middle click and not clicking directly on a node
        if (e.target.closest('.flow-node') || e.target.closest('.flow-controls')) {
          return;
        }
        if (this.pannable) {
          this.isPanning = true;
          this.panStart = {
            x: e.clientX - this.panX,
            y: e.clientY - this.panY
          };
          this.hasMoved = false;
          window.addEventListener('mousemove', this.onMouseMove);
          window.addEventListener('mouseup', this.onMouseUp);
        }
      },
      onMouseMove(e) {
        if (this.isPanning) {
          this.panX = e.clientX - this.panStart.x;
          this.panY = e.clientY - this.panStart.y;
          this.hasMoved = true;
        } else if (this.draggingNode) {
          this.hasMoved = true;
          const newX = Math.round((e.clientX - this.panX) / this.zoom - this.dragOffset.x);
          const newY = Math.round((e.clientY - this.panY) / this.zoom - this.dragOffset.y);
          this.draggingNode.x = Math.max(0, newX);
          this.draggingNode.y = Math.max(0, newY);
          this.$emit('node-drag', this.draggingNode);
        }
      },
      onMouseUp() {
        if (this.isPanning) {
          this.isPanning = false;
          if (!this.hasMoved) {
            this.$emit('pane-click');
          }
        }
        if (this.draggingNode) {
          this.$emit('node-drag-end', this.draggingNode);
          this.draggingNode = null;
        }
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
      },
      onWheel(e) {
        if (!this.zoomable) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.min(Math.max(this.zoom + delta, this.minZoom), this.maxZoom);
        
        // Zoom towards mouse position
        const rect = this.$el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = newZoom / this.zoom;
        this.panX = mouseX - (mouseX - this.panX) * zoomFactor;
        this.panY = mouseY - (mouseY - this.panY) * zoomFactor;
        this.zoom = parseFloat(newZoom.toFixed(2));
      },

      // Node drag handlers
      onMouseDownNode(node, e) {
        e.stopPropagation();
        this.activeNodeId = node.id;
        this.$emit('node-click', node);

        if (this.draggable && e.button === 0) {
          this.draggingNode = node;
          this.hasMoved = false;
          const rect = e.currentTarget.getBoundingClientRect();
          this.dragOffset = {
            x: (e.clientX - rect.left) / this.zoom,
            y: (e.clientY - rect.top) / this.zoom
          };
          window.addEventListener('mousemove', this.onMouseMove);
          window.addEventListener('mouseup', this.onMouseUp);
        }
      },

      // Controls
      zoomIn() {
        this.zoom = Math.min(parseFloat((this.zoom + 0.15).toFixed(2)), this.maxZoom);
      },
      zoomOut() {
        this.zoom = Math.max(parseFloat((this.zoom - 0.15).toFixed(2)), this.minZoom);
      },
      resetView() {
        this.zoom = 1;
        this.panX = 40;
        this.panY = 30;
      },
      fitView() {
        if (!this.nodes.length) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.nodes.forEach(n => {
          const w = n.width || 220;
          const h = n.height || 110;
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.x + w > maxX) maxX = n.x + w;
          if (n.y + h > maxY) maxY = n.y + h;
        });

        const rect = this.$el.getBoundingClientRect();
        const padding = 60;
        const totalW = maxX - minX + padding * 2;
        const totalH = maxY - minY + padding * 2;
        
        const scaleX = rect.width / totalW;
        const scaleY = rect.height / totalH;
        const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY), this.minZoom), 1.2);

        this.zoom = parseFloat(fitScale.toFixed(2));
        this.panX = (rect.width - (maxX - minX) * this.zoom) / 2 - minX * this.zoom;
        this.panY = (rect.height - (maxY - minY) * this.zoom) / 2 - minY * this.zoom;
      },

      // Connection Path Calculation (Cubic Bezier curve)
      getConnectionPath(conn) {
        const sourceId = conn.source || conn.from;
        const targetId = conn.target || conn.to;
        const srcNode = this.nodeMap[sourceId];
        const tgtNode = this.nodeMap[targetId];

        if (!srcNode || !tgtNode) return '';

        const srcW = srcNode.width || 230;
        const srcH = srcNode.height || 110;
        const tgtW = tgtNode.width || 230;
        const tgtH = tgtNode.height || 110;

        // Auto determine side ports (horizontal or vertical)
        const isHorizontal = Math.abs(tgtNode.x - srcNode.x) > Math.abs(tgtNode.y - srcNode.y) * 0.8;

        let x1, y1, x2, y2, cx1, cy1, cx2, cy2;

        if (isHorizontal) {
          // Horizontal flow
          if (tgtNode.x > srcNode.x) {
            x1 = srcNode.x + srcW;
            y1 = srcNode.y + srcH / 2;
            x2 = tgtNode.x;
            y2 = tgtNode.y + tgtH / 2;
          } else {
            x1 = srcNode.x;
            y1 = srcNode.y + srcH / 2;
            x2 = tgtNode.x + tgtW;
            y2 = tgtNode.y + tgtH / 2;
          }
          const dx = Math.abs(x2 - x1) * 0.5;
          cx1 = x1 + (x2 > x1 ? dx : -dx);
          cy1 = y1;
          cx2 = x2 + (x2 > x1 ? -dx : dx);
          cy2 = y2;
        } else {
          // Vertical flow
          if (tgtNode.y > srcNode.y) {
            x1 = srcNode.x + srcW / 2;
            y1 = srcNode.y + srcH;
            x2 = tgtNode.x + tgtW / 2;
            y2 = tgtNode.y;
          } else {
            x1 = srcNode.x + srcW / 2;
            y1 = srcNode.y;
            x2 = tgtNode.x + tgtW / 2;
            y2 = tgtNode.y + tgtH;
          }
          const dy = Math.abs(y2 - y1) * 0.5;
          cx1 = x1;
          cy1 = y1 + (y2 > y1 ? dy : -dy);
          cx2 = x2;
          cy2 = y2 + (y2 > y1 ? -dy : dy);
        }

        return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
      },

      getConnectionCenter(conn) {
        const sourceId = conn.source || conn.from;
        const targetId = conn.target || conn.to;
        const srcNode = this.nodeMap[sourceId];
        const tgtNode = this.nodeMap[targetId];
        if (!srcNode || !tgtNode) return { x: 0, y: 0 };

        const srcW = srcNode.width || 230;
        const srcH = srcNode.height || 110;
        const tgtW = tgtNode.width || 230;
        const tgtH = tgtNode.height || 110;

        return {
          x: (srcNode.x + srcW / 2 + tgtNode.x + tgtW / 2) / 2,
          y: (srcNode.y + srcH / 2 + tgtNode.y + tgtH / 2) / 2
        };
      },

      getConnColor(conn) {
        const status = conn.status || 'default';
        switch (status) {
          case 'success': return '#10b981';
          case 'running': return '#3b82f6';
          case 'error': return '#ef4444';
          case 'warning': return '#f59e0b';
          default: return '#94a3b8';
        }
      },

      getNodeStatusBadge(status) {
        switch (status) {
          case 'success':
            return { text: 'สำเร็จ', class: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: '✓' };
          case 'running':
            return { text: 'กำลังรัน...', class: 'bg-blue-100 text-blue-700 border-blue-300 animate-pulse', icon: '⏳' };
          case 'error':
            return { text: 'ผิดพลาด', class: 'bg-rose-100 text-rose-700 border-rose-300', icon: '✕' };
          case 'warning':
            return { text: 'เตือน', class: 'bg-amber-100 text-amber-700 border-amber-300', icon: '⚠️' };
          default:
            return { text: 'รอทำงาน', class: 'bg-slate-100 text-slate-600 border-slate-200', icon: '○' };
        }
      },

      getNodeBorderClass(node) {
        const isSelected = this.activeNodeId === node.id;
        const status = node.status || 'default';
        let statusStyle = '';
        switch (status) {
          case 'success':
            statusStyle = isSelected ? 'border-emerald-500 ring-4 ring-emerald-100 shadow-lg' : 'border-emerald-400 hover:border-emerald-500';
            break;
          case 'running':
            statusStyle = 'border-blue-500 ring-4 ring-blue-100 shadow-lg animate-pulse';
            break;
          case 'error':
            statusStyle = isSelected ? 'border-rose-500 ring-4 ring-rose-100 shadow-lg' : 'border-rose-400 hover:border-rose-500 shadow-md';
            break;
          case 'warning':
            statusStyle = isSelected ? 'border-amber-500 ring-4 ring-amber-100 shadow-lg' : 'border-amber-400 hover:border-amber-500';
            break;
          default:
            statusStyle = isSelected ? 'border-indigo-500 ring-4 ring-indigo-100 shadow-md' : 'border-slate-200 hover:border-slate-300';
        }
        return statusStyle;
      }
    },
    template: `
      <div 
        class="vue2-flow-container relative w-full h-full overflow-hidden select-none bg-slate-900/5 rounded-2xl border border-slate-200/80 cursor-grab active:cursor-grabbing"
        @mousedown="onMouseDownCanvas"
        @wheel="onWheel"
        style="min-height: 520px;"
      >
        <!-- Background Grid Pattern -->
        <svg v-if="grid" class="absolute inset-0 w-full h-full pointer-events-none opacity-40">
          <defs>
            <pattern id="flow-grid-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="#94a3b8" opacity="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#flow-grid-pattern)" />
        </svg>

        <!-- Main Flow Viewport (Pan & Zoom Layer) -->
        <div 
          class="flow-viewport absolute inset-0 origin-top-left transition-transform duration-75"
          :style="{ transform: canvasTransform }"
        >
          <!-- SVG Connections Layer -->
          <svg class="flow-connections-layer absolute inset-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible z-10">
            <defs>
              <!-- Arrowhead Markers -->
              <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
              </marker>
              <marker id="arrow-success" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
              </marker>
              <marker id="arrow-running" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
              </marker>
              <marker id="arrow-error" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
              </marker>
              <marker id="arrow-warning" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
              </marker>
            </defs>

            <!-- Render Connections -->
            <g v-for="conn in effectiveConns" :key="conn.id || (conn.source + '-' + conn.target)">
              <!-- Outer Glow / Background Path -->
              <path
                :d="getConnectionPath(conn)"
                fill="none"
                :stroke="getConnColor(conn)"
                stroke-width="6"
                stroke-opacity="0.18"
                class="pointer-events-auto cursor-pointer"
                @click="$emit('conn-click', conn)"
              />
              <!-- Main Line Path -->
              <path
                :d="getConnectionPath(conn)"
                fill="none"
                :stroke="getConnColor(conn)"
                :stroke-width="conn.status === 'running' || conn.status === 'success' ? '2.5' : '2'"
                :stroke-dasharray="conn.status === 'running' || conn.animated ? '6,4' : (conn.dashed ? '4,4' : 'none')"
                :class="{ 'animate-flow-dash': conn.status === 'running' || conn.animated }"
                :marker-end="'url(#arrow-' + (conn.status || 'default') + ')'"
                class="transition-all duration-300 pointer-events-auto cursor-pointer"
                @click="$emit('conn-click', conn)"
              />
              <!-- Connection Label -->
              <g v-if="conn.label" :transform="'translate(' + getConnectionCenter(conn).x + ',' + getConnectionCenter(conn).y + ')'">
                <rect x="-35" y="-10" width="70" height="20" rx="10" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" class="shadow-sm" />
                <text x="0" y="3.5" text-anchor="middle" font-size="9" font-weight="600" fill="#64748b" font-family="sans-serif">
                  {{ conn.label }}
                </text>
              </g>
            </g>
          </svg>

          <!-- Nodes Layer -->
          <div class="flow-nodes-layer absolute inset-0 pointer-events-none z-20">
            <div
              v-for="node in nodes"
              :key="node.id"
              :id="'flow-node-' + node.id"
              class="flow-node absolute pointer-events-auto cursor-move transition-shadow duration-200"
              :style="{
                left: node.x + 'px',
                top: node.y + 'px',
                width: (node.width || 230) + 'px',
                minHeight: (node.height || 105) + 'px'
              }"
              @mousedown="onMouseDownNode(node, $event)"
              @dblclick="$emit('node-double-click', node)"
            >
              <!-- Slot for Custom Node Template -->
              <slot name="node" :node="node" :selected="activeNodeId === node.id">
                <!-- Default Node Card -->
                <div 
                  :class="[
                    'bg-white rounded-xl border p-3.5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between',
                    getNodeBorderClass(node)
                  ]"
                  :style="{ minHeight: (node.height || 105) + 'px' }"
                >
                  <!-- Top Row: Icon, Title & Status -->
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2 min-w-0">
                      <div 
                        class="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 shadow-sm"
                        :style="{ backgroundColor: node.iconBg || '#f1f5f9', color: node.iconColor || '#334155' }"
                      >
                        {{ node.icon || '📌' }}
                      </div>
                      <div class="min-w-0">
                        <span class="text-xs font-bold text-slate-800 truncate block leading-tight">
                          {{ node.name || node.label || 'Step' }}
                        </span>
                        <span class="text-[10px] text-slate-500 truncate block mt-0.5">
                          {{ node.sublabel || node.tableName || '' }}
                        </span>
                      </div>
                    </div>

                    <!-- Status Badge -->
                    <span 
                      :class="[
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1',
                        getNodeStatusBadge(node.status).class
                      ]"
                    >
                      <span>{{ getNodeStatusBadge(node.status).icon }}</span>
                      <span>{{ getNodeStatusBadge(node.status).text }}</span>
                    </span>
                  </div>

                  <!-- Details / Metric Row -->
                  <div class="text-[11px] text-slate-600 bg-slate-50/80 rounded-lg px-2.5 py-1.5 border border-slate-100 flex items-center justify-between mt-auto">
                    <span class="text-slate-500 font-mono text-[10px]">{{ node.dataCount !== undefined ? node.dataCount + ' รายการ' : (node.tag || 'Data Node') }}</span>
                    <span v-if="node.timeMs" class="text-slate-400 font-mono text-[10px]">{{ node.timeMs }}ms</span>
                    <span v-else-if="node.errorText" class="text-rose-600 font-semibold text-[10px] truncate max-w-[120px]">{{ node.errorText }}</span>
                    <span v-else class="text-slate-400 text-[10px]">คลิกดูรายละเอียด →</span>
                  </div>
                </div>
              </slot>
            </div>
          </div>
        </div>

        <!-- Floating Canvas Controls (Bottom Left) -->
        <div 
          v-if="showControls"
          class="flow-controls absolute bottom-4 left-4 z-30 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm p-1.5 rounded-xl border border-slate-200 shadow-md text-slate-700 font-medium text-xs"
        >
          <button 
            @click="zoomIn" 
            title="ขยาย (Zoom In)" 
            class="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition active:scale-95"
          >
            ＋
          </button>
          <span class="px-1 text-[11px] font-mono text-slate-500 min-w-[36px] text-center">
            {{ Math.round(zoom * 100) }}%
          </span>
          <button 
            @click="zoomOut" 
            title="ย่อ (Zoom Out)" 
            class="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition active:scale-95"
          >
            －
          </button>
          <div class="w-px h-4 bg-slate-200 mx-0.5"></div>
          <button 
            @click="fitView" 
            title="ปรับขนาดพอดีหน้าจอ (Fit View)" 
            class="px-2 h-7 rounded-lg hover:bg-slate-100 flex items-center gap-1 text-xs transition active:scale-95"
          >
            <span>⛶</span>
            <span class="hidden sm:inline">พอดีจอ</span>
          </button>
          <button 
            @click="resetView" 
            title="รีเซ็ตตำแหน่ง (Reset View)" 
            class="px-2 h-7 rounded-lg hover:bg-slate-100 flex items-center gap-1 text-xs transition active:scale-95"
          >
            <span>↺</span>
            <span class="hidden sm:inline">100%</span>
          </button>
        </div>

        <!-- Canvas Legend & Helper (Bottom Right) -->
        <div class="absolute bottom-4 right-4 z-30 hidden md:flex items-center gap-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm text-[11px] text-slate-500">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> ปกติ (Pass)</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-rose-500"></span> ผิดพลาด (Error)</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span> เตือน (Warning)</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span> กำลังรัน</span>
        </div>
      </div>
    `
  };

  // Register Globally
  global.Vue.component('v-flow', Vue2Flow);
  global.Vue.component('vue2-flow', Vue2Flow);

  // Dash Animation Styles
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes flowDash {
      to {
        stroke-dashoffset: -20;
      }
    }
    .animate-flow-dash {
      animation: flowDash 0.8s linear infinite;
    }
  `;
  document.head.appendChild(styleEl);

})(window);
