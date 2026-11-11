export function validSchedule(value) {
  const queueNames=Array.from({length:12},(_,i)=>Math.floor(i/2+1)+'.'+(i%2+1));
  return !!value && Number.isFinite(Date.parse(value.fetchedAt)) && Array.isArray(value.days) && value.days.length>0 && value.days.length<=10 &&
    value.days.every(day=>/^\d{4}-\d{2}-\d{2}$/.test(day.date)&&day.queues&&queueNames.every(queue=>Array.isArray(day.queues[queue])&&day.queues[queue].every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(Number.isInteger)&&pair[0]>=0&&pair[0]<pair[1]&&pair[1]<=1440)));
}
export function diffSchedules(previous,next) {
  if (!validSchedule(next)) throw new Error('Невідомий формат графіка.');
  if (!validSchedule(previous)) return [];
  const result=[];
  for(const day of next.days){
    const before=previous.days.find(item=>item.date===day.date);if(!before)continue;
    for(const queue of Object.keys(day.queues)){
      if(!before.queues[queue])continue;
      const intervals=[];
      for(let minute=0;minute<1440;minute++){
        const wasOff=before.queues[queue].some(([start,end])=>minute>=start&&minute<end);
        const isOff=day.queues[queue].some(([start,end])=>minute>=start&&minute<end);
        if(wasOff===isOff)continue;
        const last=intervals.at(-1);
        if(last&&last.end===minute&&last.isOff===isOff)last.end++;
        else intervals.push({start:minute,end:minute+1,wasOff,isOff});
      }
      if(intervals.length)result.push({date:day.date,queue,intervals});
    }
  }
  return result;
}
export function validScheduleChanges(value) {
  return Array.isArray(value)&&value.length<=120&&value.every(change=>/^\d{4}-\d{2}-\d{2}$/.test(change.date)&&/^[1-6]\.[12]$/.test(change.queue)&&Array.isArray(change.intervals)&&change.intervals.length<=1440&&change.intervals.every(i=>Number.isInteger(i.start)&&Number.isInteger(i.end)&&i.start>=0&&i.end<=1440&&i.start<i.end&&typeof i.wasOff==='boolean'&&typeof i.isOff==='boolean'&&i.wasOff!==i.isOff));
}
