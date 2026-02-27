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
    const { prompt } = await req.json()
    if (!prompt) {
      throw new Error('Prompt is required')
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

Regras:
- Seja sempre educado, conciso e profissional. Responda em português.
- Você tem ferramentas para gerenciar o sistema: "add_transaction", "delete_product" e "delete_transaction".
- IMPORTANTE SOBRE ADICIONAR TRANSAÇÕES (add_transaction): 
  - NUNCA peça ao usuário o "ID do Produto". O usuário não sabe o que é isso. 
  - Você mesmo deve encontrar o "ID do produto" na lista de "Estoque Atual" acima correspondente ao nome que o usuário falou.
  - Se estiver faltando o preço ("price_per_unit") ou se o nome do produto for ambíguo (ex: ele falou "1 litro" mas há vários produtos de 1L), pergunte de forma natural: "Qual produto de 1 litro você adicionou/vendeu?" ou "Qual foi o valor unitário?".
  - Só chame a ferramenta "add_transaction" quando tiver certeza do produto exato, da quantidade e do preço ("price_per_unit").
- Ao ser solicitado para registrar compra ou venda, use "add_transaction". "IN" para compras, "OUT" para vendas.
- Ao ser solicitado para excluir ou deletar um produto, use "delete_product". (Cuidado: certifique-se do ID testando com o estoque acima).
- Ao ser solicitado para excluir uma transação/pedido/venda, use "delete_transaction".`

    // 3. Define Tools for Gemini Function Calling
    const tools = [{
      function_declarations: [
        {
          name: "add_transaction",
          description: "Registra uma nova entrada (compra/reposição) ou saída (venda) no estoque.",
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
    console.log("Calling Gemini API with prompt:", prompt);
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
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ],
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
