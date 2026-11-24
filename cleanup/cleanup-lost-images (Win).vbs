Option Explicit

' ================= CONFIGURAÇÃO =================
Const PASTA_MODULO = "simply-insane-notes"
Const ARQUIVO_MANIFESTO = "used-images.txt"
Const CABECALHO_ESPERADO = "# SIMPLY-INSANE-NOTES-MANIFEST"
Const IDADE_MINIMA_MINUTOS = 60

' ================= EXECUÇÃO =================
Dim fso, pastaWorlds, mundo
Set fso = CreateObject("Scripting.FileSystemObject")

pastaWorlds = EncontrarPastaWorlds(fso, WScript.ScriptFullName)
If Len(pastaWorlds) = 0 Or Not fso.FolderExists(pastaWorlds) Then WScript.Quit 0

For Each mundo In fso.GetFolder(pastaWorlds).SubFolders
  LimparMundo fso, mundo.Path
Next

' ================= LOCALIZAÇÃO RELATIVA =================
Function EncontrarPastaWorlds(fso, caminhoScript)
  Dim atual, pai
  atual = fso.GetParentFolderName(caminhoScript)

  Do While Len(atual) > 0
    If LCase(fso.GetFileName(atual)) = "modules" Then
      pai = fso.GetParentFolderName(atual)
      If Len(pai) > 0 Then
        EncontrarPastaWorlds = fso.BuildPath(pai, "worlds")
        Exit Function
      End If
    End If

    pai = fso.GetParentFolderName(atual)
    If pai = atual Then Exit Do
    atual = pai
  Loop

  EncontrarPastaWorlds = ""
End Function

' ================= LIMPEZA POR MUNDO =================
Sub LimparMundo(fso, caminhoMundo)
  Dim pastaBase, caminhoManifesto, pastaImagens
  pastaBase = fso.BuildPath(caminhoMundo, PASTA_MODULO)
  caminhoManifesto = fso.BuildPath(pastaBase, ARQUIVO_MANIFESTO)
  pastaImagens = fso.BuildPath(pastaBase, "images")

  If Not fso.FileExists(caminhoManifesto) Then Exit Sub
  If Not fso.FolderExists(pastaImagens) Then Exit Sub

  Dim emUso, stream, linha, primeiraLinha, nomeLimpo
  Set emUso = CreateObject("Scripting.Dictionary")
  emUso.CompareMode = 1

  Set stream = fso.OpenTextFile(caminhoManifesto, 1, False)
  primeiraLinha = True

  Do Until stream.AtEndOfStream
    linha = Trim(stream.ReadLine)
    If primeiraLinha Then
      primeiraLinha = False
      If linha <> CABECALHO_ESPERADO Then
        stream.Close
        Exit Sub
      End If
    ElseIf Len(linha) > 0 Then
      nomeLimpo = LCase(linha)
      If Not emUso.Exists(nomeLimpo) Then
        emUso.Add nomeLimpo, True
      End If
    End If
  Loop
  stream.Close

  Dim arquivo
  For Each arquivo In fso.GetFolder(pastaImagens).Files
    If Not emUso.Exists(LCase(arquivo.Name)) Then
      If DateDiff("n", arquivo.DateLastModified, Now) >= IDADE_MINIMA_MINUTOS Then
        On Error Resume Next
        arquivo.Delete True
        On Error GoTo 0
      End If
    End If
  Next
End Sub