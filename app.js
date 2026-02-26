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
const navItems = document.querySelectorAll('.nav-item');

// Modals & Forms
const modalProduct = document.getElementById('modal-product');
const modalTransaction = document.getElementById('modal-transaction');
const formProduct = document.getElementById('form-product');
const formTransaction = document.getElementById('form-transaction');
const btnAddProduct = document.getElementById('btn-add-product');
const btnAddTransaction = document.getElementById('btn-add-transaction');
const menuToggle = document.getElementById('menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar = document.querySelector('.sidebar');
const closeModals = document.querySelectorAll('.close-modal');

// Page Load
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

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

    // Transaction Type change (show/hide sales price)
    document.getElementById('t-type').addEventListener('change', (e) => {
        const container = document.getElementById('sales-price-container');
        if (e.target.value === 'OUT') {
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    });
}

function switchView(view) {
    currentView = view;
    navItems.forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    viewDashboard.classList.remove('active');
    viewProducts.classList.remove('active');
    viewTransactions.classList.remove('active');

    document.getElementById(`view-${view}`).classList.add('active');
    renderAll();
}

function renderAll() {
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'products') renderProducts();
    if (currentView === 'transactions') renderTransactions();
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
            <td>${t.type === 'OUT' ? formatCurrency(t.price_per_unit) : '---'}</td>
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
    const productData = {
        name: document.getElementById('p-name').value,
        size: document.getElementById('p-size').value,
        purchase_price: parseFloat(document.getElementById('p-purchase-price').value),
        sales_price: parseFloat(document.getElementById('p-sales-price').value),
        stock_quantity: parseInt(document.getElementById('p-stock').value),
        min_stock_alert: parseInt(document.getElementById('p-min-alert').value)
    };

    if (id) {
        // Update
        const { error } = await _supabase.from('products').update(productData).eq('id', id);
        if (error) alert('Erro ao atualizar produto: ' + error.message);
    } else {
        // Create
        const { error } = await _supabase.from('products').insert([productData]);
        if (error) alert('Erro ao criar produto: ' + error.message);
    }

    modalProduct.classList.remove('active');
    await initApp();
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('transaction-id').value;
    const type = document.getElementById('t-type').value;
    const qty = parseInt(document.getElementById('t-qty').value);
    const productId = document.getElementById('t-product').value;
    const price = parseFloat(document.getElementById('t-price').value);

    // If editing, we first need to REVERSE the old transaction effect on stock
    if (id) {
        const oldT = transactions.find(t => t.id === id);
        if (oldT) {
            await adjustStock(oldT.product_id, oldT.type === 'IN' ? -oldT.quantity : oldT.quantity);
        }
        
        const { error } = await _supabase.from('transactions').update({
            product_id: productId,
            type: type,
            quantity: qty,
            price_per_unit: type === 'OUT' ? price : 0
        }).eq('id', id);
        
        if (error) {
            alert('Erro ao atualizar transação: ' + error.message);
            return;
        }
    } else {
        // New Transaction
        const { error } = await _supabase.from('transactions').insert([{
            product_id: productId,
            type: type,
            quantity: qty,
            price_per_unit: type === 'OUT' ? price : 0
        }]);
        
        if (error) {
            alert('Erro ao criar transação: ' + error.message);
            return;
        }
    }

    // Apply new effect on stock
    await adjustStock(productId, type === 'IN' ? qty : -qty);

    modalTransaction.classList.remove('active');
    await initApp();
}

async function adjustStock(productId, delta) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const newStock = (product.stock_quantity || 0) + delta;
    const { error } = await _supabase
        .from('products')
        .update({ stock_quantity: newStock })
        .eq('id', productId);
    
    if (error) console.error('Error adjusting stock:', error);
}

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
    
    document.getElementById('sales-price-container').style.display = t.type === 'OUT' ? 'block' : 'none';
    document.getElementById('modal-transaction-title').innerText = 'Editar Transação';
    modalTransaction.classList.add('active');
};

window.deleteTransaction = async (id) => {
    const t = transactions.find(t => t.id === id);
    if (!t || !confirm('Tem certeza? O estoque será ajustado automaticamente.')) return;

    // Reverse stock effect
    await adjustStock(t.product_id, t.type === 'IN' ? -t.quantity : t.quantity);

    const { error } = await _supabase.from('transactions').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else await initApp();
};

// Helpers
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function populateProductSelect() {
    const select = document.getElementById('t-product');
    select.innerHTML = products.map(p => `
        <option value="${p.id}">${p.name} (${p.size}) - Est: ${p.stock_quantity}</option>
    `).join('');
}
