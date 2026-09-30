// 星空
(function(){
  var c=document.getElementById('stars'),x=c.getContext('2d'),S=[];
  function rs(){c.width=innerWidth;c.height=innerHeight}
  rs();addEventListener('resize',rs);
  for(var i=0;i<160;i++)S.push({x:Math.random(),y:Math.random(),r:Math.random()*1.6+.3,s:Math.random()*.35+.06,o:Math.random()*.6+.25});
  (function anim(){
    x.clearRect(0,0,c.width,c.height);
    for(var i=0;i<S.length;i++){var s=S[i];s.y+=s.s/c.height;if(s.y>1)s.y=0;
      x.globalAlpha=s.o*(0.6+0.4*Math.sin(Date.now()/900+i));
      x.fillStyle='#cfe0ff';x.beginPath();x.arc(s.x*c.width,s.y*c.height,s.r,0,7);x.fill();}
    x.globalAlpha=1;requestAnimationFrame(anim);
  })();
})();
// 滚动显现
(function(){
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}});
  },{threshold:.12});
  document.querySelectorAll('.rv').forEach(function(el){io.observe(el)});
})();
