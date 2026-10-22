# Windows 11 Snap Layouts & Top Snap Bar para Linux Mint (Cinnamon)

Extensão nativa para o Cinnamon Desktop que recria fielmente a experiência do **Snap Layouts** e da **Top Snap Bar** do Windows 11, baseada na especificação técnica de engenharia reversa de [WINDOWS_SNAP_LAYOUTS_RE.md](file:///home/modesto/Projetos/win-snaplayout-linux/WINDOWS_SNAP_LAYOUTS_RE.md).

---

## 🚀 Funcionalidades

1. **Top Snap Bar (Ao Arrastar para o Topo):**
   - Ao segurar e arrastar qualquer janela em direção ao topo de **qualquer um dos monitores**, uma barra translúcida (estilo *Acrylic / Mica*) desliza suavemente do topo da tela.
   - Posicione o cursor sobre uma das zonas do layout desejado para ver a **Ghost Preview** (silhueta semi-transparente em azul) na tela indicando onde a janela será posicionada.
   - Solte o botão do mouse sobre a zona para redimensionar e posicionar a janela de forma atômica.
   - Se afastar o cursor da barra de volta para o centro da tela, a barra sobe e some sem interferir no comportamento normal do sistema.

2. **Flyout Snap Menu (`Super + Z`):**
   - Pressione o atalho <kbd>Super</kbd> + <kbd>Z</kbd> com qualquer janela focada para abrir o menu pop-up de Snap Layouts centralizado na janela ativa.
   - Passe o mouse sobre as zonas para visualizar o preview em tempo real e clique na zona desejada.
   - Suporte a teclado: pressione os números <kbd>1</kbd> a <kbd>6</kbd> para selecionar diretamente os presets, ou <kbd>Esc</kbd> para fechar.

3. **6 Presets do Windows 11:**
   - **2 Colunas (50% / 50%):** Divisão simétrica de tela.
   - **2 Colunas (67% / 33%):** Foco assimétrico (coluna principal larga à esquerda e secundária à direita).
   - **3 Colunas (33% / 33% / 33%):** Três colunas iguais de largura ideal para monitores ultrawide ou 1080p+.
   - **4 Quadrantes (2 x 2):** Divisão em 4 janelas em grade.
   - **3 Zonas (50% Esquerda + 2 Quarters à Direita):** Metade esquerda contínua e dois quadrantes à direita.
   - **3 Zonas (Centro Foco 25% / 50% / 25%):** Coluna central dominante com duas colunas laterais de referência.

4. **Suporte Multi-Monitor e Desconto de Painéis:**
   - Detecta automaticamente em qual monitor o cursor está operando.
   - Desconta as áreas de trabalho ocupadas por barras/painéis (como painéis superiores ou inferiores do Cinnamon), garantindo que nenhuma janela fique oculta sob o painel.

---

## 📂 Estrutura de Arquivos

```
win-snaplayout-linux/
├── metadata.json              # Metadados e versão compatível do Cinnamon (5.8 a 6.6+)
├── stylesheet.css             # Estilização Fluent/Acrylic translúcida
├── extension.js               # Lógica de ganchos Clutter/Muffin, hit-testing e redimensionamento
├── settings-schema.json       # Configurações integradas às Preferências do Sistema
├── README.md                  # Documentação de uso
└── WINDOWS_SNAP_LAYOUTS_RE.md # Especificação técnica da Engenharia Reversa
```

---

## ⚙️ Instalação e Ativação

A extensão já está instalada e ativada no seu sistema em `~/.local/share/cinnamon/extensions/snap-layouts@pedro`.

Para gerenciar ou desativar/reativar manualmente:

### Pela Interface Gráfica
Abra o **Menu do Linux Mint** -> **Preferências** -> **Extensões** -> Localize **Snap Layouts** e ative ou configure.

### Pelo Terminal
```bash
# Ativar a extensão
gsettings set org.cinnamon enabled-extensions "['transparent-panels@germanfr', 'snap-layouts@pedro']"

# Verificar status
gsettings get org.cinnamon enabled-extensions
```
