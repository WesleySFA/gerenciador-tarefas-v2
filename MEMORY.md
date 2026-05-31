# MEMORY - Gerenciador de Tarefas

## Deploy
- URL: https://gerenciador-tarefas-v2-production.up.railway.app
- Repo: WesleySFA/gerenciador-tarefas-v2 (branch master)
- Auto-deploy via GitHub

## Estrutura atual (public/)

```
public/
  index.html
  css/
    base.css       (sempre carrega)
    desktop.css    (min-width: 769px)
    tablet.css     (481px-768px)
    mobile.css     (max-width: 480px)
  js/
    shared.js      (sempre carrega)
    desktop.js     (console.log)
    mobile.js      (touch drag)
```

## O que foi feito

### Separação CSS/JS por dispositivo
- Antes: arquivos únicos (styles.css, groups.css, script.js, groups.js)
- Agora: arquivos separados por categoria de dispositivo
- Regras CSS orfas (1392-1598 em styles.css) movidas para mobile.css
- No mobile.css, o bloco @media 480px vem DEPOIS das orfas para prevalecer

### Regras importantes
- Desktop: botoes header com flex:none (tamanho original forçado)
- Tablet: botoes flexiveis com flex:1
- Mobile: botoes compactos (font-size:0.68rem, padding:6px 3px)

### Historico de commits recentes
- `f36913b` Mobile: reordena CSS para @media 480px sobrescrever regras orfas
- `6645cfb` Separa CSS e JS em arquivos dedicados por dispositivo
- `6d6c4a5` JS do pop-up sino: volta ao codigo original unico
- `d0fa54e` Desktop pop-up sino: alinhado a direita
- `3799b5c` Swap: mobile pop-up sino volta ao original
- `106b811` Reverte JS do pop-up sino no desktop para o original
- `aac0c9f` Melhora responsivo mobile: formulario centralizado

### Nota
- Servidor Express em index.js (nao precisa alterar)
- Railway config via railway.json (nao precisa alterar)
