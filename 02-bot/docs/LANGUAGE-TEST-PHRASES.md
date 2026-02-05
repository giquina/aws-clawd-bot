# Multi-Language Test Phrases

Test phrases for voice note language detection in each supported language.

## English (en) 🇬🇧

### Simple Commands
- "What's the status of the project?"
- "List my repositories"
- "Deploy the application"
- "Show me recent commits"

### Complex Instructions
- "Create a new page for the dashboard with user authentication"
- "Review the pull request and tell me if there are any issues"
- "Search for all TODO comments in the JUDO project"

### Questions
- "How many tasks are left in the TODO list?"
- "When was the last deployment?"
- "Who approved the last pull request?"

---

## Portuguese (pt) 🇵🇹

### Comandos Simples
- "Qual é o status do projeto?"
- "Lista os meus repositórios"
- "Faz o deploy da aplicação"
- "Mostra-me os commits recentes"

### Instruções Complexas
- "Cria uma nova página para o dashboard com autenticação de utilizadores"
- "Revê o pull request e diz-me se há algum problema"
- "Procura todos os comentários TODO no projeto JUDO"

### Perguntas
- "Quantas tarefas faltam na lista TODO?"
- "Quando foi o último deployment?"
- "Quem aprovou o último pull request?"

### Business Queries
- "Qual é o prazo do relatório da GACC?"
- "Mostra-me as despesas do mês"
- "Quando é a próxima reunião?"

---

## Spanish (es) 🇪🇸

### Comandos Simples
- "¿Cuál es el estado del proyecto?"
- "Lista mis repositorios"
- "Despliega la aplicación"
- "Muéstrame los commits recientes"

### Instrucciones Complejas
- "Crea una nueva página para el dashboard con autenticación de usuarios"
- "Revisa el pull request y dime si hay algún problema"
- "Busca todos los comentarios TODO en el proyecto JUDO"

### Preguntas
- "¿Cuántas tareas quedan en la lista TODO?"
- "¿Cuándo fue el último despliegue?"
- "¿Quién aprobó el último pull request?"

### Business Queries
- "¿Cuál es la fecha límite del informe?"
- "Muéstrame los gastos del mes"
- "¿Cuándo es la próxima reunión?"

---

## French (fr) 🇫🇷

### Commandes Simples
- "Quel est le statut du projet?"
- "Liste mes dépôts"
- "Déploie l'application"
- "Montre-moi les commits récents"

### Instructions Complexes
- "Crée une nouvelle page pour le tableau de bord avec authentification des utilisateurs"
- "Révise la pull request et dis-moi s'il y a des problèmes"
- "Recherche tous les commentaires TODO dans le projet JUDO"

### Questions
- "Combien de tâches restent dans la liste TODO?"
- "Quand était le dernier déploiement?"
- "Qui a approuvé la dernière pull request?"

### Business Queries
- "Quelle est la date limite du rapport?"
- "Montre-moi les dépenses du mois"
- "Quand est la prochaine réunion?"

---

## Transcription-Only Languages

These languages can be transcribed but will receive English responses.

### German (de) 🇩🇪
- "Was ist der Status des Projekts?"
- "Zeige mir die letzten Commits"
- "Erstelle eine neue Seite für das Dashboard"

### Italian (it) 🇮🇹
- "Qual è lo stato del progetto?"
- "Mostrami i commit recenti"
- "Crea una nuova pagina per la dashboard"

### Dutch (nl) 🇳🇱
- "Wat is de status van het project?"
- "Laat me de recente commits zien"
- "Maak een nieuwe pagina voor het dashboard"

### Chinese (zh) 🇨🇳
- "项目的状态是什么？"
- "显示最近的提交"
- "为仪表板创建新页面"

### Japanese (ja) 🇯🇵
- "プロジェクトのステータスは？"
- "最近のコミットを見せて"
- "ダッシュボード用の新しいページを作成"

---

## Testing Workflow

1. **Send voice note** in target language
2. **Verify transcription** is accurate
3. **Check response language** matches input (for supported languages)
4. **Confirm language preference** is saved

### Expected Behavior

#### Supported Language (pt/es/fr)
```
User: 🎤 [Portuguese voice note]
Bot:  📝 "Olá, qual é o status do projeto?"
      🌍 Detected: Portuguese (pt)
      💾 Saved language preference
      🤖 [Response in Portuguese]
```

#### Unsupported Language (de/it/zh/ja)
```
User: 🎤 [German voice note]
Bot:  📝 "Was ist der Status des Projekts?"
      🌍 Detected: German (de)
      ⚠️  German responses not supported
      🤖 [Response in English]
```

---

## Mixed Language Scenarios

### Code + Language
**English with code:**
> "Create a function called getUserData that returns user information"

**Portuguese with code:**
> "Cria uma função chamada getUserData que retorna informação do utilizador"

### Technical Terms
Technical terms are often preserved in original language:
> "Faz o deploy da aplicação no Vercel"
> (Deploy → preserved, rest → Portuguese)

### Numbers and Dates
Numbers and dates are transcribed as spoken:
> "O deadline é dia 15 de fevereiro"
> (Transcribed exactly as spoken)

---

## Accent and Dialect Notes

### Portuguese
- **Brazilian Portuguese**: "você" → "vocês"
- **European Portuguese**: "tu" → "vocês"
- Both dialects are supported and transcribed accurately

### Spanish
- **Spain Spanish**: "vosotros"
- **Latin American Spanish**: "ustedes"
- Both dialects are supported

### French
- **France French**: Standard pronunciation
- **Canadian French**: Accent differences handled
- **African French**: Regional variations supported

---

## Quality Tips

For best transcription quality:

1. **Speak clearly** and at normal pace
2. **Avoid background noise** if possible
3. **Use complete sentences** for better context
4. **Pause between commands** for clarity
5. **Enunciate technical terms** carefully

---

## Common Transcription Issues

### Issue: Numbers transcribed as words
**Example:** "fifteen" instead of "15"
**Solution:** This is expected. ClawdBot understands both formats.

### Issue: Technical terms misheard
**Example:** "Vercel" → "Versal"
**Solution:** Use text commands for critical technical terms or speak more clearly.

### Issue: Mixed language confusion
**Example:** English phrase in Portuguese voice note
**Solution:** Stick to one language per voice note for best results.

---

**Last Updated:** 2026-02-04
