(function(){

	var demo = document.querySelector('.demo');
	var wrapper = demo.querySelector('.wrapper');
	var button = document.querySelector('.rwd button');

	// só mostra responsive-play até 600px de largura
	// TODO sera que vale a pena fazer isso responder a screen resize?
	if (demo.offsetWidth < 600) {
		demo.innerHTML = '<figure class="responsive video"><div class="video-wrapper"><iframe src="https://www.youtube.com/embed/N_17S54YNhE?HD=1&amp;rel=0&amp;showinfo=0&amp;modestbranding=1" frameborder="0" allowfullscreen></iframe></div></figure>';
		demo.className = demo.className + ' video';
		document.documentElement.className += ' no-responsive-play';
		return;
	}

	// TODO detectar tbm se nao tem CSS3 transitions e colocar o video no lugar

	// cria iframe
	var iframe = document.createElement('div');
	iframe.className = 'archive-demo-note';
	iframe.style.minHeight = '8rem';
	iframe.innerHTML = 'O demo histórico do site Arquitetura Java foi substituído. <a href="https://www.alura.com.br/especial/arquitetura-java" target="_blank" rel="external noopener">Ver o destino atual ↗</a>';
	wrapper.appendChild(iframe);

	// responsive-play, css3 edition
	button.onclick = function() {
		// reset
		demo.className = 'demo';
		iframe.style.width = '';
		
		// play, delayed
		setTimeout(function() {
			demo.className = 'demo up';
			iframe.style.width = wrapper.offsetWidth - 20 + 'px';
		}, 200);
	};

	// cria protetor de scroll
	var protector = document.createElement('div');
	protector.className = 'protector';
	demo.appendChild(protector);

	protector.onclick = function() {
		demo.removeChild(this);
	};

})();