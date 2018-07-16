select
 status
 ,max(pathTo)
,count(*)
,sum(size)/(1024*1024)
,min(createdAt)
,min(updatedAt)
from
filePaths
where pathFrom like 'E:%'
  and type = 'FILE'
group by status