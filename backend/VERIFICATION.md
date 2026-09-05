# Verificação, Validação e Normas — Solver LBM D3Q19

Este documento registra o que foi feito para alinhar o solver CFD (`app/services/solver/`)
às práticas de Verificação & Validação (V&V) usadas pela indústria, e — igualmente
importante — o que **não** está coberto, para não gerar uma falsa impressão de conformidade.

## O que é "verificação" e "validação" aqui

Seguindo a distinção usada pela ASME V&V 20 e pelo AIAA G-077:

- **Verificação de código**: a implementação corresponde exatamente à sua especificação
  matemática? (a malha tem a simetria certa, os pesos somam 1, a equação de equilíbrio
  conserva massa/momento, a condição de contorno reflete exatamente na direção oposta...)
- **Validação**: o resultado da simulação corresponde ao comportamento físico esperado?
  (um obstáculo deflete o escoamento, um canal é mais rápido no centro do que na parede...)

Isso é implementado como testes automatizados executáveis em `backend/tests/test_solver_verification.py`
(`pytest backend/tests -v`, requer `pip install -r backend/requirements-dev.txt`). Não é
documentação estática — é código que falha se alguém quebrar essas propriedades no futuro.

## Bugs de física corrigidos nesta revisão

Auditoria completa do solver encontrou e corrigiu, em ordem de severidade:

1. **Anisotropia na malha D3Q19** (`lattice.py`): duas das 12 direções diagonais
   estavam duplicadas (mesma velocidade) e as outras duas correspondentes nunca apareciam
   na malha — quebrando a isotropia do plano y-z (`sum(w_i·cy_i·cz_i)` era 1/9 em vez de 0).
   Essa é a premissa matemática sobre a qual toda a derivação de Chapman-Enskog (que garante
   que o LBM recupera as equações de Navier-Stokes corretas) se apoia. Era a causa raiz de uma
   instabilidade numérica que fazia **qualquer** campo de velocidade não-uniforme divergir para
   NaN em ~50 iterações, independente de condição de contorno, viscosidade, BGK vs. TRT, ou
   precisão float32/float64 — ou seja: nenhuma simulação com geometria real ou perfil de
   entrada não-trivial teria convergido antes desta correção.
2. **Mapeamento de direção oposta errado** (`OPPOSITE` em `lattice.py`): usado pelo bounce-back
   (paredes sólidas) e pelo operador de colisão TRT. Estava pareando cada direção diagonal
   com uma rotação de 90°, não com o oposto verdadeiro.
3. **Bounce-back era um no-op** (`boundary.py`): o loop de reflexão processava cada par de
   direções duas vezes, desfazendo a própria troca — paredes e geometria importada (STL/OBJ/STEP)
   tinham efeito zero sobre o escoamento.
4. **Condição de contorno de velocidade/pressão (Zou-He)** (`boundary.py`): agrupava
   incorretamente as 19 populações (usava só 4 de 19, com sinal trocado entre as faces
   oeste/leste). Reescrita com a formulação completa de Zou & He (1997), generalizada para
   D3Q19 conforme Hecht & Harting (2010), incluindo o fechamento por "non-equilibrium
   bounce-back" (mais estável que fechar por equilíbrio puro).
5. **Modelo de turbulência LES nunca era aplicado** (`lbm.py`): a viscosidade turbulenta
   (Smagorinsky) era calculada a cada iteração e descartada — a colisão sempre usava só a
   viscosidade molecular fixa. Agora a viscosidade efetiva (molecular + submalha) é usada de
   fato, célula a célula.
6. **Parâmetro "mágico" do TRT com fórmula que se autocancelava** (`lbm.py`): o valor padrão
   colapsava algebricamente para 0.56 independente de qualquer coisa. Substituído por
   Λ=3/16, a recomendação padrão da literatura (Ginzburg, d'Humières & Ginzburg 2008) para
   eliminar o erro de posicionamento de parede do bounce-back.
7. **Pesos do lattice térmico D3Q7 somavam 4/7, não 1** (`thermal.py`): viola a normalização
   básica de qualquer distribuição de equilíbrio em LBM. Corrigido para o esquema padrão
   (w0=1/4, wi=1/8), com a relação de difusividade e a equação de equilíbrio (linear, sem
   termo quadrático — correto para advecção-difusão passiva) ajustadas de acordo.

Prova: `backend/tests/test_solver_verification.py` roda um caso com obstáculo, TRT, LES e
solver térmico juntos por 1500 iterações e permanece estável e fisicamente coerente
(velocidade zero dentro do sólido, temperatura limitada entre a parede e a entrada).

## Dispersão de gás (empuxo/buoyancy) — nova física, não apenas configuração

Adicionado para cenários de vazamento/dispersão (gás mais leve ou mais pesado que o ar):
força de corpo no LBM (esquema de Guo, Zheng & Shi 2002), acoplamento de empuxo de
Boussinesq com o campo escalar (reaproveitando o solver térmico D3Q7 como concentração),
e um termo-fonte contínuo (vazamento) em qualquer ponto do domínio — `lbm.py`,
`routers/simulations.py` (`scenario_type: "gas_dispersion"`).

Verificado (`test_solver_verification.py`):
- **Quantitativamente, contra solução analítica exata**: escoamento de Poiseuille com força
  de corpo uniforme entre duas paredes (`u(y) = F/(2ν)·y·(H-y)`) — erro relativo máximo <5%
  com BGK. É o teste padrão da literatura para validar um esquema de força em LBM.
- **Qualitativamente**: gás mais leve que o ambiente sobe (+z), mais pesado desce (-z);
  termo-fonte mantém a concentração no ponto de vazamento e propaga a jusante.
- **Achado real durante a verificação**: combinar essa força com o colisor TRT (não o BGK
  simples) não reproduz a solução analítica perto de paredes (erro ~6x, não-constante) —
  é um problema conhecido e difícil na literatura de LBM, não uma correção rápida. O solver
  **força BGK automaticamente** sempre que há força ativa (buoyancy ou vazamento), documentado
  e testado (`test_forcing_with_trt_falls_back_to_bgk`) — nunca entrega silenciosamente um
  resultado plausível-mas-errado.
- **Limite de estabilidade real, não bug**: um vazamento contínuo (ao contrário de uma mancha
  única) sustenta a força de empuxo indefinidamente; um `buoyancy_accel` forte demais para a
  viscosidade do domínio diverge (análogo a uma condição CFL). Os limites testados/documentados
  ficam em `SolverConfig.buoyancy_accel` e `test_source_and_buoyancy_together_need_a_moderate_buoyancy_accel`.
- Também corrigido no caminho: o critério de convergência olhava só a densidade, que quase não
  muda em cenários dominados por empuxo — declarava "convergido" na iteração 0, antes da pluma
  sequer se formar. Agora também exige que a velocidade tenha se estabilizado.

**O que ainda não existe**: presets de gases reais (metano, propano, cloro, amônia...) com
densidade relativa pré-cadastrada, classes de estabilidade atmosférica (Pasquill D/E/F), e a
tela de configuração desse cenário no frontend — hoje só a API aceita `scenario_type:
"gas_dispersion"` diretamente.

## O que essas correções cobrem, em relação às normas citadas

| Norma / diretriz | Cobertura |
|---|---|
| **ASME V&V 20**, **AIAA G-077** | Metodologia de verificação de código aplicada (propriedades exatas testadas automaticamente); *não* inclui um estudo formal de quantificação de incerteza (GCI, convergência de malha multi-nível) — isso é um próximo passo, não feito aqui. |
| **ERCOFTAC Best Practice** | As escolhas de modelagem (LES Smagorinsky, TRT, condições de contorno Zou-He) seguem a literatura padrão citada nos comentários do código. Um estudo de sensibilidade de malha/y+ não foi feito. |
| **ISO/IEC 25010** | Parcialmente: confiabilidade e correção funcional foram diretamente trabalhadas nesta revisão. |

## O que **não** está coberto (e por quê)

- **ISO 9001**, **DO-178C**, **ISO 26262**: são certificações de **processo organizacional**
  (auditoria externa, documentação de ciclo de vida, rastreabilidade de requisitos) — não algo
  que se implementa em código. Exigem um processo de certificação formal separado se a MMX
  Mechanics decidir buscá-las.
- **NASA-STD-7009**, **ASHRAE Guideline 10/Standard 55**, **NORSOK Z-013**: normas de
  aplicação setorial (o *uso* da simulação em um contexto regulatório específico), não do
  motor de cálculo em si. Relevantes quando a MMX Mechanics for aplicar o software a um caso
  de uso desses setores (ex.: dispersão de gás para segurança industrial, conforto térmico em
  HVAC) — nesse ponto, o relatório de validação específico do caso é que precisa citá-las.
- **Faixa de validade física**: o solver é LBM D3Q19 clássico — **fracamente compressível**,
  válido para número de Mach ≲ 0.3 (líquidos e gases a baixa velocidade: ventilação, HVAC,
  dispersão lenta de gases, câmaras frigoríficas). **Não** é adequado para gases em alta
  velocidade/compressíveis com choques (explosões, escoamento supersônico) — para isso seria
  necessário um solver de volumes finitos compressível diferente (é essa a categoria de
  problema que o JAXFLUIDS, citado nas referências do projeto, resolve).
