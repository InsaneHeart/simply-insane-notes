================================================================================

SIMPLY INSANE NOTES — UNUSED IMAGES CLEANUP

================================================================================



[ENGLISH]



Whenever images are uploaded into notes, they are stored in:

  Data/worlds/<world-id>/simply-insane-notes/images/



The module automatically maintains a manifest file (used-images.txt) listing

every image currently referenced by any user in that world.



These optional scripts delete orphaned images that are no longer referenced in

any note and are older than 60 minutes (safety window for recent uploads).



Files:

  - cleanup-lost-images (Win).vbs   -> For Windows hosts (runs silently)

  - cleanup-lost-images (Linux).sh  -> For Linux / macOS / Docker hosts



How to use (Windows):

  Double-click "cleanup-lost-images (Win).vbs" to run it manually, or add it to

  Windows Task Scheduler (for example, once a day or on system startup).



How to use (Linux / macOS):

  1. Make the script executable once:

       chmod +x "cleanup-lost-images (Linux).sh"



  2. Run it manually:

       ./"cleanup-lost-images (Linux).sh"



  3. Or schedule it with cron (crontab -e), e.g. daily at 4:00 AM:

       0 4 * * * /path/to/Data/modules/simply-insane-notes/cleanup/"cleanup-lost-images (Linux).sh"





================================================================================

[PORTUGUÊS - BRASIL]



Sempre que imagens são enviadas nas notas, elas ficam salvas em:

  Data/worlds/<id-do-mundo>/simply-insane-notes/images/



O módulo mantém automaticamente um arquivo de manifesto (used-images.txt)

listando todas as imagens que ainda estão sendo usadas por qualquer usuário.



Estes scripts opcionais apagam imagens órfãs que não são mais usadas em nenhuma

nota e têm mais de 60 minutos (margem de segurança para envios recentes).



Arquivos:

  - cleanup-lost-images (Win).vbs   -> Para Windows (executa em segundo plano)

  - cleanup-lost-images (Linux).sh  -> Para Linux / macOS / Docker



Como usar (Windows):

  Dê duplo clique em "cleanup-lost-images (Win).vbs" para rodar manualmente, ou

  adicione no Agendador de Tarefas do Windows (ex.: uma vez por dia).



Como usar (Linux / macOS):

  1. Dê permissão de execução uma única vez:

       chmod +x "cleanup-lost-images (Linux).sh"



  2. Execute manualmente:

       ./"cleanup-lost-images (Linux).sh"



  3. Ou agende no cron (crontab -e), ex. todo dia às 04:00:

       0 4 * * * /caminho/para/Data/modules/simply-insane-notes/cleanup/"cleanup-lost-images (Linux).sh"





================================================================================

[ESPAÑOL]



Cada vez que se suben imágenes en las notas, se guardan en:

  Data/worlds/<id-del-mundo>/simply-insane-notes/images/



El módulo mantiene automáticamente un archivo de manifiesto (used-images.txt)

con todas las imágenes que siguen en uso por cualquier usuario del mundo.



Estos scripts opcionales eliminan imágenes huérfanas que ya no se usan en

ninguna nota y tienen más de 60 minutos (margen de seguridad).



Archivos:

  - cleanup-lost-images (Win).vbs   -> Para Windows (se ejecuta en silencio)

  - cleanup-lost-images (Linux).sh  -> Para Linux / macOS / Docker



Cómo usar (Windows):

  Haz doble clic en "cleanup-lost-images (Win).vbs" para ejecutarlo manualmente,

  o agrégalo al Programador de tareas de Windows (ej.: una vez al día).



Cómo usar (Linux / macOS):

  1. Otorga permiso de ejecución una sola vez:

       chmod +x "cleanup-lost-images (Linux).sh"



  2. Ejecútalo manualmente:

       ./"cleanup-lost-images (Linux).sh"



  3. O prográmalo con cron (crontab -e), ej. cada día a las 04:00:

       0 4 * * * /ruta/a/Data/modules/simply-insane-notes/cleanup/"cleanup-lost-images (Linux).sh"





================================================================================

[FRANÇAIS]



Lorsque des images sont ajoutées aux notes, elles sont enregistrées dans :

  Data/worlds/<id-du-monde>/simply-insane-notes/images/



Le module maintient automatiquement un fichier manifeste (used-images.txt)

listant toutes les images actuellement utilisées par les utilisateurs du monde.



Ces scripts optionnels suppriment les images orphelines qui ne sont plus

utilisées dans aucune note et qui ont plus de 60 minutes (marge de sécurité).



Fichiers :

  - cleanup-lost-images (Win).vbs   -> Pour Windows (exécution silencieuse)

  - cleanup-lost-images (Linux).sh  -> Pour Linux / macOS / Docker



Utilisation (Windows) :

  Double-cliquez sur "cleanup-lost-images (Win).vbs" pour l'exécuter, ou

  ajoutez-le au Planificateur de tâches Windows (ex. : une fois par jour).



Utilisation (Linux / macOS) :

  1. Rendez le script exécutable une seule fois :

       chmod +x "cleanup-lost-images (Linux).sh"



  2. Exécutez-le manuellement :

       ./"cleanup-lost-images (Linux).sh"



  3. Ou planifiez-le avec cron (crontab -e), ex. tous les jours à 04h00 :

       0 4 * * * /chemin/vers/Data/modules/simply-insane-notes/cleanup/"cleanup-lost-images (Linux).sh"