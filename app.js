// Supabase Configuration
const supabaseUrl = 'https://ytkudhablxwfdupawcyc.supabase.co';
const supabaseKey = 'sb_publishable_gKqhUI4Tx28AfPmx1A7Pdw_Uv6xnl4F';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// State Management
let products = [];
let transactions = [];
let currentView = 'dashboard';

// DOM Elements
const viewDashboard = document.getElementById('view-dashboard');
const viewProducts = document.getElementById('view-products');
const viewTransactions = document.getElementById('view-transactions');
const viewReports = document.getElementById('view-reports');
const viewGuide = document.getElementById('view-guide');
const navItems = document.querySelectorAll('.nav-item');

// Modals & Forms
const modalProduct = document.getElementById('modal-product');
const modalTransaction = document.getElementById('modal-transaction');
const formProduct = document.getElementById('form-product');
const formTransaction = document.getElementById('form-transaction');
const tPriceLabel = document.getElementById('t-price-label');
const btnAddProduct = document.getElementById('btn-add-product');
const btnAddTransaction = document.getElementById('btn-add-transaction');
const menuToggle = document.getElementById('menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar = document.querySelector('.sidebar');
const closeModals = document.querySelectorAll('.close-modal');

// Report Elements
const btnGenerateReport = document.getElementById('btn-generate-report');
const btnPrintReport = document.getElementById('btn-print-report');
const reportContent = document.getElementById('report-content');
const filterStartDate = document.getElementById('filter-start-date');
const filterEndDate = document.getElementById('filter-end-date');
const filterType = document.getElementById('filter-type');

// Auth Elements
const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.querySelector('.app-container');
const authStateLogin = document.getElementById('auth-state-login');
const authStatePending = document.getElementById('auth-state-pending');
const pendingEmail = document.getElementById('pending-email');
const btnPendingLogout = document.getElementById('btn-pending-logout');
const btnGoogleLogin = document.getElementById('btn-google-login');
const btnLogout = document.getElementById('btn-logout');

// AI Chat Elements
const btnChatToggle = document.getElementById('btn-chat-toggle');
const chatWindow = document.getElementById('chat-window');
const btnChatClose = document.getElementById('btn-chat-close');
const formChat = document.getElementById('form-chat');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

let currentUser = null;

// Page Load
document.addEventListener('DOMContentLoaded', () => {
    // Check initial auth state
    _supabase.auth.getSession().then(({ data: { session } }) => {
        handleAuthStateChange(session);
    });

    // Listen for auth changes
    _supabase.auth.onAuthStateChange((_event, session) => {
        handleAuthStateChange(session);
    });

    setupEventListeners();
});

async function handleAuthStateChange(session) {
    if (session) {
        // User logged in via Google
        const userEmail = session.user.email;
        
        // Check whitelist
        const { data: whitelistData, error: whitelistError } = await _supabase
            .from('usuarios_autorizados')
            .select('email')
            .eq('email', userEmail)
            .single();

        if (whitelistData) {
            // Authorized
            currentUser = session.user;
            authOverlay.classList.remove('active');
            appContainer.style.display = 'flex';
            initApp(); // Load data
        } else {
            // Not Authorized (Pending)
            currentUser = null;
            appContainer.style.display = 'none';
            authOverlay.classList.add('active');
            authStateLogin.style.display = 'none';
            authStatePending.style.display = 'block';
            pendingEmail.textContent = userEmail;
            if (whitelistError && whitelistError.code !== 'PGRST116') {
                console.error('Error checking whitelist:', whitelistError);
            }
        }
    } else {
        // User logged out
        currentUser = null;
        appContainer.style.display = 'none';
        authOverlay.classList.add('active');
        authStateLogin.style.display = 'block';
        authStatePending.style.display = 'none';
        // Clear data
        products = [];
        transactions = [];
        updateDashboard();
        renderProductsTable();
        renderTransactionsTable();
        switchView('dashboard');
    }
}

async function initApp() {
    await fetchData();
    renderAll();
}

async function fetchData() {
    // Fetch Products
    const { data: pData, error: pError } = await _supabase
        .from('products')
        .select('*')
        .order('name');
    
    if (pError) console.error('Error fetching products:', pError);
    else products = pData;

    // Fetch Transactions
    const { data: tData, error: tError } = await _supabase
        .from('transactions')
        .select(`
            *,
            products (name)
        `)
        .order('created_at', { ascending: false });

    if (tError) console.error('Error fetching transactions:', tError);
    else transactions = tData;
}

function setupEventListeners() {
    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.getAttribute('data-view');
            switchView(view);
            // Close sidebar on mobile after clicking
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
                menuToggle.classList.remove('active');
                sidebarOverlay.classList.remove('active');
            }
        });
    });

    // Mobile Menu Toggle
    menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('active');
        sidebar.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
    });

    sidebarOverlay.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
    });

    // Modals
    btnAddProduct.addEventListener('click', () => {
        formProduct.reset();
        document.getElementById('product-id').value = '';
        document.getElementById('p-stock').value = '0';
        document.getElementById('modal-product-title').innerText = 'Adicionar Produto';
        modalProduct.classList.add('active');
    });

    btnAddTransaction.addEventListener('click', () => {
        formTransaction.reset();
        document.getElementById('transaction-id').value = '';
        document.getElementById('modal-transaction-title').innerText = 'Nova Transação';
        populateProductSelect();
        modalTransaction.classList.add('active');
    });

    closeModals.forEach(btn => {
        btn.addEventListener('click', () => {
            modalProduct.classList.remove('active');
            modalTransaction.classList.remove('active');
        });
    });

    // Forms
    formProduct.addEventListener('submit', handleProductSubmit);
    formTransaction.addEventListener('submit', handleTransactionSubmit);

    // Transaction Type change (update label)
    document.getElementById('t-type').addEventListener('change', (e) => {
        if (e.target.value === 'OUT') {
            tPriceLabel.innerText = 'Preço de Venda Unitário (R$)';
        } else {
            tPriceLabel.innerText = 'Preço de Custo Unitário (R$)';
        }
    });

    // --- Auth Listeners ---
    if (btnGoogleLogin) {
        btnGoogleLogin.addEventListener('click', async () => {
            try {
                const { error } = await _supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: window.location.href
                    }
                });
                if (error) throw error;
            } catch (error) {
                console.error('Erro Google:', error);
                alert('Erro ao conectar com Google: ' + error.message);
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await _supabase.auth.signOut();
        });
    }

    if (btnPendingLogout) {
        btnPendingLogout.addEventListener('click', async () => {
            await _supabase.auth.signOut();
        });
    }

    // Reports
    if (btnGenerateReport) {
        btnGenerateReport.addEventListener('click', generateReport);
    }
    if (btnPrintReport) {
        btnPrintReport.addEventListener('click', () => {
            window.print();
        });
    }

    // AI Chat
    if (btnChatToggle && chatWindow && btnChatClose) {
        btnChatToggle.addEventListener('click', () => {
            chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none';
        });

        btnChatClose.addEventListener('click', () => {
            chatWindow.style.display = 'none';
        });
    }

    if (formChat) {
        formChat.addEventListener('submit', handleChatSubmit);
    }
}

// --- Report Generation Functions ---
function generateReport() {
    const startDate = filterStartDate.value;
    const endDate = filterEndDate.value;
    const type = filterType.value;

    let filtered = [...transactions];

    if (startDate) {
        filtered = filtered.filter(t => new Date(t.created_at) >= new Date(startDate));
    }
    if (endDate) {
        // Add one day to endDate to include transactions on the end date
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        filtered = filtered.filter(t => new Date(t.created_at) < end);
    }
    if (type !== 'ALL') {
        filtered = filtered.filter(t => t.type === type);
    }

    renderReport(filtered, startDate, endDate, type);
}

function renderReport(data, startDate, endDate, type) {
    let totalIn = 0;
    let totalOut = 0;
    let netProfit = 0;

    data.forEach(t => {
        const itemTotal = t.quantity * t.price_per_unit; // Use price_per_unit from transaction
        if (t.type === 'IN') {
            totalIn += itemTotal;
        } else {
            totalOut += itemTotal;
            // Profit calculation: (sales price - unit cost) * quantity
            const product = products.find(p => p.id === t.product_id);
            if (product) {
                netProfit += (t.price_per_unit - product.purchase_price) * t.quantity; // Use price_per_unit from transaction
            }
        }
    });

    const typeLabel = type === 'ALL' ? 'Todas as Transações' : type === 'IN' ? 'Entradas (Compras)' : 'Saídas (Vendas)';
    const formatDateBr = (dStr) => {
        if (!dStr) return null;
        const [y, m, d] = dStr.split('-');
        return `${d}/${m}/${y}`;
    };
    
    const startStr = formatDateBr(startDate);
    const endStr = formatDateBr(endDate);
    const dateLabel = (startStr || endStr) ? `${startStr || 'Início'} até ${endStr || 'Hoje'}` : 'Todo o período';

    let html = `
        <div class="report-header">
            <h2>Relatório de Operações - CleanStock</h2>
            <p><strong>Período:</strong> ${dateLabel}</p>
            <p><strong>Tipo:</strong> ${typeLabel}</p>
        </div>
        
        <div class="report-summary">
            <div class="report-summary-card">
                <h4>Total Entradas (Custo)</h4>
                <div class="value" style="color: var(--danger);">${formatCurrency(totalIn)}</div>
            </div>
            <div class="report-summary-card">
                <h4>Total Saídas (Receita)</h4>
                <div class="value" style="color: var(--success);">${formatCurrency(totalOut)}</div>
            </div>
            <div class="report-summary-card">
                <h4>Lucro Bruto (Apenas Vendas)</h4>
                <div class="value" style="color: var(--primary);">${formatCurrency(netProfit)}</div>
            </div>
        </div>

        <div class="report-table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Produto</th>
                        <th>Qtd.</th>
                        <th>Preço Un.</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (data.length === 0) {
        html += `<tr><td colspan="6" style="text-align: center;">Nenhuma transação encontrada para este período.</td></tr>`;
    } else {
        // Sort data by date ascending for the report
        data.slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at)).forEach(t => {
            const product = products.find(p => p.id === t.product_id);
            const productName = product ? product.name : 'Produto Excluído';
            const itemTotal = t.quantity * t.price_per_unit;
            const typeText = t.type === 'IN' ? 'Entrada' : 'Saída';
            const typeColor = t.type === 'IN' ? 'var(--danger)' : 'var(--success)';
            
            html += `
                <tr>
                    <td>${new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                    <td style="color: ${typeColor}; font-weight: 500;">${typeText}</td>
                    <td>${productName}</td>
                    <td>${t.quantity}</td>
                    <td>${formatCurrency(t.price_per_unit)}</td>
                    <td><strong>${formatCurrency(itemTotal)}</strong></td>
                </tr>
            `;
        });
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    reportContent.innerHTML = html;
    reportContent.style.display = 'block';
}
function switchView(view) {
    currentView = view;
    navItems.forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    viewDashboard.classList.remove('active');
    viewProducts.classList.remove('active');
    viewTransactions.classList.remove('active');
    viewReports.classList.remove('active');
    viewGuide.classList.remove('active');
 
    document.getElementById(`view-${view}`).classList.add('active');
    renderAll();
}

function renderAll() {
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'products') renderProducts();
    if (currentView === 'transactions') renderTransactions();
    if (currentView === 'guide') { /* Static view, no dynamic render needed */ }
}

// --- Render Functions ---

function renderDashboard() {
    const totalProfitEl = document.getElementById('total-profit');
    const inventoryValueEl = document.getElementById('inventory-value');
    const potentialSalesValueEl = document.getElementById('potential-sales-value');
    const lowStockCountEl = document.getElementById('low-stock-count');
    const recentSalesTable = document.querySelector('#recent-sales-table tbody');

    // Calculations
    let totalProfit = 0;
    let inventoryValueByPurchase = 0;
    let potentialSalesValue = 0;
    let lowStockCount = 0;

    transactions.forEach(t => {
        if (t.type === 'OUT') {
            const product = products.find(p => p.id === t.product_id);
            if (product) {
                const profit = (t.price_per_unit - product.purchase_price) * t.quantity;
                totalProfit += profit;
            }
        }
    });

    products.forEach(p => {
        inventoryValueByPurchase += (p.stock_quantity * p.purchase_price);
        potentialSalesValue += (p.stock_quantity * p.sales_price);
        if (p.stock_quantity <= p.min_stock_alert) lowStockCount++;
    });

    // Update UI
    totalProfitEl.innerText = formatCurrency(totalProfit);
    inventoryValueEl.innerText = formatCurrency(inventoryValueByPurchase);
    potentialSalesValueEl.innerText = formatCurrency(potentialSalesValue);
    lowStockCountEl.innerText = lowStockCount;

    // Recent Sales
    recentSalesTable.innerHTML = transactions
        .filter(t => t.type === 'OUT')
        .slice(0, 5)
        .map(t => {
            const product = products.find(p => p.id === t.product_id);
            const profit = product ? (t.price_per_unit - product.purchase_price) * t.quantity : 0;
            return `
                <tr>
                    <td>${new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>${t.products?.name || 'Produto Removido'}</td>
                    <td>${t.quantity}</td>
                    <td>${formatCurrency(t.quantity * t.price_per_unit)}</td>
                    <td class="text-success">${formatCurrency(profit)}</td>
                </tr>
            `;
        }).join('');
}

function renderProducts() {
    const tableBody = document.querySelector('#products-table tbody');
    tableBody.innerHTML = products.map(p => `
        <tr>
            <td>${p.name}</td>
            <td>${p.size}</td>
            <td class="${p.stock_quantity <= p.min_stock_alert ? 'text-danger fw-bold' : ''}">
                ${p.stock_quantity}
            </td>
            <td>${formatCurrency(p.purchase_price)}</td>
            <td class="fw-bold text-primary">${formatCurrency(p.sales_price)}</td>
            <td>${p.min_stock_alert}</td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn-icon btn-edit" onclick="editProduct('${p.id}')">✏️ Editar</button>
                    <button class="btn-icon btn-delete" onclick="deleteProduct('${p.id}')">🗑️ Excluir</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderTransactions() {
    const tableBody = document.querySelector('#transactions-table tbody');
    tableBody.innerHTML = transactions.map(t => `
        <tr>
            <td>${new Date(t.created_at).toLocaleString('pt-BR')}</td>
            <td><span class="badge badge-${t.type.toLowerCase()}">${t.type === 'IN' ? 'Entrada' : 'Saída'}</span></td>
            <td>${t.products?.name || '---'}</td>
            <td>${t.quantity}</td>
            <td>${formatCurrency(t.price_per_unit)}</td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn-icon btn-edit" onclick="editTransaction('${t.id}')">✏️ Editar</button>
                    <button class="btn-icon btn-delete" onclick="deleteTransaction('${t.id}')">🗑️ Excluir</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// --- CRUD Operations ---

async function handleProductSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    
    const name = document.getElementById('p-name').value.trim();
    const size = document.getElementById('p-size').value;
    const purchasePrice = parseFloat(document.getElementById('p-purchase-price').value) || 0;
    const salesPrice = parseFloat(document.getElementById('p-sales-price').value) || 0;
    const stockQuantity = parseInt(document.getElementById('p-stock').value) || 0;
    const minAlert = parseInt(document.getElementById('p-min-alert').value) || 0;

    const productData = {
        name: name,
        size: size,
        purchase_price: purchasePrice,
        sales_price: salesPrice,
        stock_quantity: stockQuantity,
        min_stock_alert: minAlert
    };

    // Close modal immediately for better UX
    modalProduct.classList.remove('active');

    try {
        if (id) {
            // Update
            const { error } = await _supabase.from('products').update(productData).eq('id', id);
            if (error) throw error;
        } else {
            // Create
            const { error } = await _supabase.from('products').insert([productData]);
            if (error) throw error;
        }
    } catch (err) {
        console.error('API Error (Product):', err);
        alert('Erro ao processar produto: ' + (err.message || 'Erro desconhecido'));
    } finally {
        await initApp();
    }
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('transaction-id').value;
    const type = document.getElementById('t-type').value;
    const qty = parseInt(document.getElementById('t-qty').value) || 0;
    const productId = document.getElementById('t-product').value;
    const price = parseFloat(document.getElementById('t-price').value) || 0;

    if (!productId) {
        alert('Por favor, selecione um produto.');
        return;
    }

    // Close modal immediately
    modalTransaction.classList.remove('active');

    try {
        // If editing, the database Trigger handles the stock reversal and update automatically
        if (id) {
            
            const { error } = await _supabase.from('transactions').update({
                product_id: productId,
                type: type,
                quantity: qty,
                price_per_unit: price
            }).eq('id', id);
            
            if (error) throw error;
        } else {
            // New Transaction
            const { error } = await _supabase.from('transactions').insert([{
                product_id: productId,
                type: type,
                quantity: qty,
                price_per_unit: price
            }]);
            
            if (error) throw error;
        }

        // Successfully updated/inserted. Database triggers will handle stock_quantity.

    } catch (err) {
        console.error('API Error (Transaction):', err);
        alert('Erro ao processar transação: ' + (err.message || 'Erro desconhecido'));
    } finally {
        await initApp();
    }
}

// adjustStock removed - now handled by DB Triggers

// Global functions for inline buttons
window.editProduct = (id) => {
    const p = products.find(p => p.id === id);
    if (!p) return;
    
    document.getElementById('product-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-size').value = p.size;
    document.getElementById('p-purchase-price').value = p.purchase_price;
    document.getElementById('p-sales-price').value = p.sales_price;
    document.getElementById('p-stock').value = p.stock_quantity;
    document.getElementById('p-min-alert').value = p.min_stock_alert;
    
    document.getElementById('modal-product-title').innerText = 'Editar Produto';
    modalProduct.classList.add('active');
};

window.deleteProduct = async (id) => {
    if (!confirm('Tem certeza? Isso pode afetar transações existentes.')) return;
    const { error } = await _supabase.from('products').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else await initApp();
};

window.editTransaction = (id) => {
    const t = transactions.find(t => t.id === id);
    if (!t) return;

    populateProductSelect();
    document.getElementById('transaction-id').value = t.id;
    document.getElementById('t-product').value = t.product_id;
    document.getElementById('t-type').value = t.type;
    document.getElementById('t-qty').value = t.quantity;
    document.getElementById('t-price').value = t.price_per_unit;
    
    tPriceLabel.innerText = t.type === 'OUT' ? 'Preço de Venda Unitário (R$)' : 'Preço de Custo Unitário (R$)';
    document.getElementById('modal-transaction-title').innerText = 'Editar Transação';
    modalTransaction.classList.add('active');
};

window.deleteTransaction = async (id) => {
    const t = transactions.find(t => t.id === id);
    if (!t || !confirm('Tem certeza? O estoque será ajustado automaticamente.')) return;

    // Database triggers will handle stock_quantity automatically on delete

    const { error } = await _supabase.from('transactions').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else await initApp();
};

// Helpers
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// --- AI Chat Functions ---
let chatHistory = []; // Armazena o histórico da 

async function handleChatSubmit(e) {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    // 1. Add user message to UI & History
    appendChatMessage('user', message);
    chatHistory.push({ role: 'user', parts: [{ text: message }] });
    chatInput.value = '';

    // 2. Determine if we are waiting for Edge Function
    appendChatLoading();

    try {
        const { data, error } = await _supabase.functions.invoke('chat-agent', {
            body: { history: chatHistory }
        });

        removeChatLoading();

        if (error) {
            console.error('Edge Function Error:', error);
            appendChatMessage('ai', 'Desculpe, ocorreu um erro ao se comunicar com o servidor.');
        } else if (data && data.reply) {
            // Salva a resposta do modelo no histórico para que ele tenha contexto depois
            chatHistory.push({ role: 'model', parts: [{ text: data.reply }] });
            appendChatMessage('ai', data.reply);
            
            // Se a IA registrou uma transação, atualizamos a tela
            if (data.reply.includes('sucesso') || data.reply.includes('cadastrado')) {
                await initApp(); // Recarrega os dados do banco
            }
        } else {
            appendChatMessage('ai', 'Não consegui formular uma resposta. Tente novamente.');
        }

    } catch (err) {
        removeChatLoading();
        console.error('Fetch Error:', err);
        appendChatMessage('ai', 'Falha na conexão. Verifique sua internet.');
    }
}

function appendChatMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}-message`;
    div.innerHTML = `<div class="message-content">${text}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendChatLoading() {
    const div = document.createElement('div');
    div.id = 'chat-loading-indicator';
    div.className = 'message ai-message';
    div.innerHTML = `
        <div class="loading-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeChatLoading() {
    const loadingEl = document.getElementById('chat-loading-indicator');
    if (loadingEl) {
        loadingEl.remove();
    }
}

function populateProductSelect() {
    const select = document.getElementById('t-product');
    select.innerHTML = products.map(p => `
        <option value="${p.id}">${p.name} (${p.size}) - Est: ${p.stock_quantity}</option>
    `).join('');
}
