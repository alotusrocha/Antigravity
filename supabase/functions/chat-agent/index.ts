import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { history } = await req.json()
    if (!history || !Array.isArray(history)) {
      throw new Error('History array is required')
    }

    // Get API Keys from Deno Environment (Secrets)
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not set in Edge Function secrets.')
    }

    // Initialize Supabase Client with the user's auth context
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 1. Fetch relevant system context dynamically (e.g., current products)
    const { data: products } = await supabaseClient.from('products').select('*')
    const productsContext = products 
      ? `Estoque Atual:\n${products.map(p => `- ${p.name} (${p.size}): ${p.stock_quantity} em estoque. ID do produto: ${p.id}`).join('\n')}`
      : 'Nenhum produto cadastrado no momento.'

    // 2. Define the System Prompt
    const systemPrompt = `Você é o Assistente Virtual do CleanStock. Ajude o usuário a gerenciar o estoque de produtos de limpeza.
    
Contexto do Estoque:
${productsContext}

BASE DE CONHECIMENTO (Instruções de Uso do UM 20 em 1):
Cozinha:
- É um poderoso desengordurante, excelente para grelhas, coifas, panelas e demais louças.
- Receita: 1/2 tampa (20ml) para 1L de água. Ideal para desengordurar grelhas, remove gordura de coifas, limpa panelas e louças. Eficaz contra gordura pesada.

Lavanderia:
- Substitui sabão em pó, amaciante e alvejante. Pode ser usado em qualquer tecido e cor.
- Receita: 1 tampa completa para cada nível da máquina.

Banheiro:
- Lava box, pia, piso, sanitário e espelho de forma prática e eficaz.
- Receita: 1/2 tampa (20ml) para 3L de água. Limpa box, remove sujeira da pia, higieniza o sanitário e deixa espelhos brilhando.

Pisos:
- Pode ser utilizado em qualquer piso, desde porcelanato até pedra (Cerâmica, Pedra natural, etc).
- Receita: Use de acordo com o nível de sujeira. Medida padrão: 1/2 tampa para 3L de água.

Automóveis:
- Lava tanto a parte externa (lataria) quanto a interna (estofados).
- Receita: 1/2 tampa (20ml) para 3L de água. Utilize junto com um pano de microfibra. Limpa lataria, higieniza estofados e remove sujeira pesada.

Vidros:
- Limpa o vidro sem manchar e deixa um brilho espetacular.
- Receita: 10ml (fundo da tampa) para 1L de água. Rendimento com economia máxima e resultado profissional.

Regras de Comportamento e Coleta de Dados:
- Seja sempre educado, conciso e profissional. Responda em português.
- Você tem ferramentas para gerenciar o sistema: "create_product", "add_transaction", "delete_product" e "delete_transaction".
- IMPORTANTE: NUNCA peça ao usuário "IDs" (ex: "Qual o ID do produto?"). O usuário não sabe o que é isso. 
- Se o usuário quiser registrar uma compra/entrada ou venda/saída:
  1. Primeiro verifique no "Estoque Atual" se o produto já existe.
  2. Se existir, e as informações estiverem completas (você sabe qual é o produto exato, a quantidade e o preço unitário), chame "add_transaction".
  3. Se estiver faltando informações (como: qual o preço pago/cobrado? ou se ele disse "1 litro" mas há vários produtos), pergunte naturalmente: "Qual foi o valor unitário pago/cobrado?" ou "Qual produto de 1L especificamente você quer movimentar?". Aguarde ele responder na próxima mensagem.
- Se o usuário quiser registrar algo sobre um PRODUTO NOVO que não existe no "Estoque Atual":
  1. Não peça para ele se virar, diga que não encontrou e se ofereça para cadastrar o novo produto.
  2. Faça pequenas perguntas para reunir as informações do produto: Nome, Tamanho (ex: 1L, 5L), Preço de Compra (se ele comprou) e Preço de Venda (opcional). 
  3. Quando tiver os dados básicos, chame a ferramenta "create_product" para cadastrar o produto no estoque COM estoque inicial, ou pergunte o que falta de forma humanizada.
- Em resumo: Seja proativo, pergunte o que falta com clareza, e use as ferramentas apenas quando tiver certeza dos dados. Nunca fale sobre banco de dados, IDs numéricos ou campos de sistema.`

    // 3. Define Tools for Gemini Function Calling
    const tools = [{
      function_declarations: [
        {
          name: "add_transaction",
          description: "Registra uma nova entrada (compra/reposição) ou saída (venda) no estoque de um produto JÁ EXISTENTE.",
          parameters: {
            type: "OBJECT",
            properties: {
              product_id: { type: "STRING", description: "O ID (UUID) do produto no banco de dados." },
              type: { type: "STRING", description: "IN para compra/entrada, OUT para venda/saída." },
              quantity: { type: "INTEGER", description: "A quantidade de unidades." },
              price_per_unit: { type: "NUMBER", description: "O valor unitário pago ou cobrado na transação." }
            },
            required: ["product_id", "type", "quantity", "price_per_unit"]
          }
        },
        {
          name: "create_product",
          description: "Cadastra/cria um novo produto do zero no sistema.",
          parameters: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING", description: "Nome do produto (ex: CleanStock MultiUso)" },
              size: { type: "STRING", description: "Tamanho (ex: 1L, 5L, 500ml)" },
              stock_quantity: { type: "INTEGER", description: "Quantidade inicial no estoque." },
              purchase_price: { type: "NUMBER", description: "Preço de compra padrão por unidade (custo)." },
              sales_price: { type: "NUMBER", description: "Preço de venda sugerido." }
            },
            required: ["name", "size", "stock_quantity", "purchase_price"]
          }
        },
        {
          name: "delete_product",
          description: "Exclui/deleta um produto permanentemente do banco de dados.",
          parameters: {
            type: "OBJECT",
            properties: {
              product_id: { type: "STRING", description: "O ID (UUID) do produto a ser excluído." }
            },
            required: ["product_id"]
          }
        },
        {
          name: "delete_transaction",
          description: "Exclui/deleta um pedido ou transação (venda ou compra).",
          parameters: {
            type: "OBJECT",
            properties: {
              transaction_id: { type: "STRING", description: "O ID numérico da transação a ser excluída." }
            },
            required: ["transaction_id"]
          }
        }
      ]
    }];

    // 4. Call Gemini API
    console.log("Calling Gemini API with history length:", history.length);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    
    const geminiRequest = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: { 
          parts: [{ text: systemPrompt }] 
        },
        contents: history,
        tools: tools
      })
    })

    const geminiResponse = await geminiRequest.json()
    console.log("Gemini Response:", JSON.stringify(geminiResponse))

    if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
      throw new Error(`Invalid response from Gemini: ${geminiResponse.error ? geminiResponse.error.message : 'Unknown error'}`)
    }

    const firstPart = geminiResponse.candidates[0].content.parts[0];

    // 5. Handle Tool Calls
    if (firstPart.functionCall) {
      const call = firstPart.functionCall;
      const args = call.args;
      
      console.log(`Executing tool ${call.name} with args:`, args);

      if (call.name === 'add_transaction') {
        const { error: txError } = await supabaseClient.from('transactions').insert({
          product_id: args.product_id,
          type: args.type,
          quantity: args.quantity,
          price_per_unit: args.price_per_unit
        });

        if (txError) throw new Error(`Erro ao adicionar transação: ${txError.message}`);
        
        return new Response(JSON.stringify({ 
          reply: `Pronto! Registrei a ${args.type === 'IN' ? 'compra' : 'venda'} de ${args.quantity} unidades com sucesso.` 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } 
      
      else if (call.name === 'create_product') {
        // Create product
        const { data: newProd, error: prodError } = await supabaseClient.from('products').insert({
          name: args.name,
          size: args.size,
          stock_quantity: args.stock_quantity,
          purchase_price: args.purchase_price,
          sales_price: args.sales_price || 0
        }).select().single();

        if (prodError) throw new Error(`Erro ao cadastrar produto: ${prodError.message}`);

        // If starting stock is > 0, also register an IN transaction for consistency
        if (args.stock_quantity > 0) {
          await supabaseClient.from('transactions').insert({
            product_id: newProd.id,
            type: 'IN',
            quantity: args.stock_quantity,
            price_per_unit: args.purchase_price
          });
        }

        return new Response(JSON.stringify({ 
          reply: `Perfeito! O produto ${args.name} (${args.size}) foi cadastrado com ${args.stock_quantity} unidades em estoque.` 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      else if (call.name === 'delete_product') {
        const { error: delError } = await supabaseClient.from('products').delete().eq('id', args.product_id);
        
        if (delError) throw new Error(`Erro ao excluir produto: ${delError.message}`);

        return new Response(JSON.stringify({ 
          reply: `Produto excluído do sistema com sucesso.` 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      else if (call.name === 'delete_transaction') {
        // Find transaction first to reverse stock (or just let the user see it's deleted)
        // Wait, the client handles stock recalculation on load. Delete is simple.
        const { error: delTxError } = await supabaseClient.from('transactions').delete().eq('id', args.transaction_id);
        
        if (delTxError) throw new Error(`Erro ao excluir pedido: ${delTxError.message}`);

        return new Response(JSON.stringify({ 
          reply: `Pedido/Transação excluída com sucesso.` 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // 6. Return standard text response if no tool was called
    const textReply = firstPart.text || "Desculpe, não consegui processar a resposta.";
    return new Response(JSON.stringify({ reply: textReply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Error processing request:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
