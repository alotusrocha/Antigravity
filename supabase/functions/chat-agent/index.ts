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
    
Contexto:
${productsContext}

Regras:
- Seja sempre educado, conciso e profissional em português.
- Você tem a ferramenta "add_transaction" para adicionar/registrar compras e vendas.
- Se o usuário disser que comprou ou vendeu algo, use a ferramenta "add_transaction" com o "product_id" correto.
- "IN" é para compras (entrada de estoque) e "OUT" é para vendas (saída de estoque).`

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
      if (call.name === 'add_transaction') {
        const args = call.args;
        console.log("Executing add_transaction tool with args:", args);
        
        // Insert transaction into database
        const { error: txError } = await supabaseClient.from('transactions').insert({
          product_id: args.product_id,
          type: args.type,
          quantity: args.quantity,
          price_per_unit: args.price_per_unit
        });

        if (txError) {
          console.error("Error inserting transaction:", txError);
          return new Response(JSON.stringify({ 
            reply: `Erro ao adicionar transação: ${txError.message}` 
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Return a success message indicating the tool worked
        return new Response(JSON.stringify({ 
          reply: `Pronto! Registrei a ${args.type === 'IN' ? 'compra' : 'venda'} de ${args.quantity} unidades com sucesso.` 
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
