/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {



    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };


// escultura en la entrada
if (hotspot.title === "<strong style=\"font-size: 13px; background-color: rgba(58, 68, 84, 0.8);\">El vuelo de las Monarcas-1</strong>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/ElVueloDeLasMonarcas-1.jpg", hotspot.title, hotspot.text);
  });
}

// Boton en piso de el Lobby
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">Exposici</span><span class=\"cf1\">ón AVA</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/RenateSunko.jpg", hotspot.title, hotspot.text);
  });
}

// Poster 1 en Lobby
if (hotspot.title === "Expo AVA") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/IMG-20251106-WA0017.jpg", hotspot.title, hotspot.text);
  });
}

// Poster lobby dia mundial de la acuarela
if (hotspot.title === "Dia Mundial de la Acuarela") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/IMG-20251101-WA0014.jpg", hotspot.title, hotspot.text);
  });
}
// Poster de acuarela venezolana
if (hotspot.title === "Acuarela Venezolana") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/IMG-20251103-WA0023.jpg", hotspot.title, hotspot.text);
  });
}

// poster artistas en lobby
if (hotspot.title === "Artistas") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/IMG-20251106-WA0018.jpg", hotspot.title, hotspot.text);
  });
}
// enlace a exposicion retrospectiva
if (hotspot.title === "<em></em><p><em>A Journey of Water and Pigment</em><br>\n</p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Danger_1883_1887.jpg", hotspot.title, hotspot.text);
  });
}
// escultura colgante espacio central
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">La Marioneta y la Luna</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/stringuniverse-v_c2-132.jpg", hotspot.title, hotspot.text);
  });
}

if (hotspot.title === "<span class=\"cf0\">Exposición AVA</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/PosterLargoVertical.png", hotspot.title, hotspot.text);
  });
}
// poster ala 1
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">Recuerdo Cotidiano</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/RecuerdoCotidiano.jpg", hotspot.title, hotspot.text);
  });
}
// Marina Lyons
if (hotspot.title === "<span class=\"cf0\">Marina Lyons</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/MarinaLyons.jpg", hotspot.title, hotspot.text);
  });
}

// Marina Lyons-Casa de las Caldetas
if (hotspot.title === "<span class=\"cf0\">Casa de </span><span class=\"cf0\">Caldetas</span><span class=\"cf0\"> en Barcelona</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/MarinaLyons-Casa de Caldetas en Barcelona.jpg", hotspot.title, hotspot.text);
  });
}

// Marina Lyons-Casa de campo en Barcelona
if (hotspot.title === "<span class=\"cf0\">Casa de campo en Barcelona</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/MarinaLyons-Casa de Campo en Barcelona.jpg", hotspot.title, hotspot.text);
  });
}
// Teresita Novelli
if (hotspot.title === "<span class=\"cf0\">Teresita</span><span class=\"cf0\"> </span><span class=\"cf0\">Novelli</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/TeresitaNovelli.jpg", hotspot.title, hotspot.text);
  });
}

// Elvia Rodriguez
if (hotspot.title === "<span class=\"cf0\">Elvia</span><span class=\"cf0\"> Rodríguez</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/ElviaRodriguez.jpg", hotspot.title, hotspot.text);
  });
}

// Teresita Novelli- Esteros de mi Llano
if (hotspot.title === "<span class=\"cf0\">Esteros de mi llano</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/TeresitaNovelli-Esteros de mi llano.jpg", hotspot.title, hotspot.text);
  });
}

// Teresita Novelli-La Andina
if (hotspot.title === "<span class=\"cf0\">La Andina</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/TeresitaNovelli-La Andina.jpg", hotspot.title, hotspot.text);
  });
}

// Elvia Rodriguez-Homenaje a Phillis Wheatley
if (hotspot.title === "Homenaje a Phillis Wheatley 1753/1784") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/ElviaRoriguez-Homenaje a Phillis Wheatley 1753-1784.jpg", hotspot.title, hotspot.text);
  });
}

// Elvia Rodriguez-Una Hermosa Chica
if (hotspot.title === "<span class=\"cf0\">Una hermosa chica</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/ElviaRodriguez Una Hermosa Chica.jpg", hotspot.title, hotspot.text);
  });
}

// Carmen Hernandez
if (hotspot.title === "<span class=\"cf0\">Carmen</span><span class=\"cf0\"> Hernandez</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/CarmenHernandez.jpg", hotspot.title, hotspot.text);
  });
}

// Carmen Hernandez-Galipan
if (hotspot.title === "<span class=\"cf0\">&nbsp;Galipán.&nbsp;</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/CarmenHernandez-Galipan.jpg", hotspot.title, hotspot.text);
  });
}

// Carmen Hernandez-Flores
if (hotspot.title === "<span class=\"cf0\">Flores 18</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-1/CarmenHernandez-Flores 18.jpg", hotspot.title, hotspot.text);
  });
}

// AVA - Centro Sala
if (hotspot.title === "AVA Expo Poster Completo") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Poster Completo.png", hotspot.title, hotspot.text);
  });
}

// ALA 2 Aliento Silvestre

if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">Aliento Silvestre</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/Aliento Silvestre.jpg", hotspot.title, hotspot.text);
  });
}

// Morelia Zamora
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">Morelia</span><span class=\"cf0\"> Zamora</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/MoreliaZamora.jpg", hotspot.title, hotspot.text);
  });
}

// Morelia Zamora serie Avila
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">Serie Avila</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/MoreliaZamora-Serie Avila.jpeg", hotspot.title, hotspot.text);
  });
}

// Morelia Zamora Viento de Lluvia
if (hotspot.title === "<span class=\"cf0\">Viento de Lluvia</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/MoreliaZamora-Viento de Lluvia.jpeg", hotspot.title, hotspot.text);
  });
}


// Elda Arcetti
if (hotspot.title === "<span class=\"cf0\">Elda </span><span class=\"cf0\">Arcetti</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/EldaArcetti.jpg", hotspot.title, hotspot.text);
  });
}

// Elda Arcetti-Flores en el campo
if (hotspot.title === "<span class=\"cf0\">Flores en el Campo</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/EldaArcetti-Flores en el Campo-b.jpg", hotspot.title, hotspot.text);
  });
}

// EldaArcetti-Rostro de Niña
if (hotspot.title === "<span class=\"cf0\">Rostro de Niña</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/EldaArcetti-Rostro de Niña-b.jpg", hotspot.title, hotspot.text);
  });
}

// Amanda Abanses
if (hotspot.title === "<span class=\"cf0\">Amanda</span><span class=\"cf0\"> </span><span class=\"cf0\">Abanses</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/Amanda Abanses.jpg", hotspot.title, hotspot.text);
  });
}

// Amanda Abanses-Naranjero
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">”Naranjero” serie pájaros chilenos</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/AmandaAbanses-Naranjero.jpeg", hotspot.title, hotspot.text);
  });
}

// Amanda Abanses-Saca Real
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">“Saca Real” serie pájaros chilenos</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/AmandaAbanses-Saca Real.jpeg", hotspot.title, hotspot.text);
  });
}

// Encarna Cantavella
if (hotspot.title === "<span class=\"cf0\">Encarna</span><span class=\"cf0\"> </span><span class=\"cf0\">Cantavella</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/EncarnaCantavella.jpg", hotspot.title, hotspot.text);
  });
}

// Encarna Cantavella-Primavera en Barcelona
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">Primavera en Barcelona</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/EncarnaCantavella-Primavera en Barcelona-b.jpg", hotspot.title, hotspot.text);
  });
}

// Encarna Cantavella-La de enfrente
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">La de enfrente</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-2/EncarnaCantavella-La de enfrente-b.jpg", hotspot.title, hotspot.text);
  });
}


// Ala 3: El Horizonte y el Alma

// El Horizonte y el Alma
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">El Horizonte y el Alma</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/El Horizonte y el Alma.jpg", hotspot.title, hotspot.text);
  });
}

// Diego Penalver Denis
if (hotspot.title === "<span class=\"cf0\">Diego</span><span class=\"cf0\"> Peñalver Denis</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/DiegoPeñalver.jpg", hotspot.title, hotspot.text);
  });
}

// Diego Penalver Denis-Autana
if (hotspot.title === "<span class=\"cf0\">Vista lejana del Tepuy </span><span class=\"cf0\">Autana</span><span class=\"cf0\"> en Venezuela</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/DiegoPeñalver-Autana 1.jpg", hotspot.title, hotspot.text);
  });
}

// Diego Penalver Denis-Autana 2
if (hotspot.title === "<span class=\"cf0\">Sobre-vuelo del Tocón</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/DiegoPeñalver-Autana 2.jpg", hotspot.title, hotspot.text);
  });
}

// Amalia Guerrero
if (hotspot.title === "<span class=\"cf0\">Amalia</span><span class=\"cf0\"> Guerrero</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/AmaliaGuerrero.jpg", hotspot.title, hotspot.text);
  });
}

// Amalia Guerrero-Riachuelo
if (hotspot.title === "<span class=\"cf0\">Riachuelo</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/AmaliaGuerrero-Riachuelo-70x60.jpg", hotspot.title, hotspot.text);
  });
}

// Amalia Guerrero-Viento del Este
if (hotspot.title === "<span class=\"cf0\">Viento del este</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/AmaliaGuerrero-Viento del Este-30x50.jpg", hotspot.title, hotspot.text);
  });
}

// Renate Sunko
if (hotspot.title === "<span class=\"cf0\">Renate</span><span class=\"cf0\"> </span><span class=\"cf0\">Sunko</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/RenateSunko.jpg", hotspot.title, hotspot.text);
  });
}

// Renate Sunko-Atardecer, puente sobre el río Orinoco
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">Atardecer, puente sobre el río Orinoco</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/RenateSunko-Atardecer-Puente sobre el río Orinoco.jpg", hotspot.title, hotspot.text);
  });
}

// Renate Sunko-De la Serie “Fabulación de la Naturaleza
if (hotspot.title === "<span class=\"cf0\">De la Serie “Fabulación de la Naturaleza”</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/RenateSunko-Fabulación de la Naturaleza.jpg", hotspot.title, hotspot.text);
  });
}

// Beatriz Baumgartner
if (hotspot.title === "<span class=\"cf0\">Beatriz Baumgartner</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/BeatrizBaumgartner.jpg", hotspot.title, hotspot.text);
  });
}

// Beatriz Baumgartner-En algún lugar
if (hotspot.title === "<span class=\"cf0\">\"En algún lugar\"</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/BeatrizBaumgartner-En Algun Lugar.jpeg", hotspot.title, hotspot.text);
  });
}

// Beatriz Baumgartner-El tren de las seis
if (hotspot.title === "<span class=\"cf0\">\"El tren de las seis\"</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-3/BeatrizBaumgartner-El Tren de las Seis.jpeg", hotspot.title, hotspot.text);
  });
}


// Ala 4 : La Naturaleza Soñada

// La Naturaleza Soñada
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">La Naturaleza Soñada</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/LaNaturalezaSonada.jpg", hotspot.title, hotspot.text);
  });
}

// Milagro Perez Alonzo
if (hotspot.title === "<span class=\"cf0\">Milagro Perez Alonzo</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/MilagroPérez.jpg", hotspot.title, hotspot.text);
  });
}

// Milagro Perez Alonzo-Cangrejo
if (hotspot.title === "<span class=\"cf0\">Cangrejo</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/MilagroPérez-Cangrejo.JPG", hotspot.title, hotspot.text);
  });
}

// Milagro Perez Alonzo-Pez León
if (hotspot.title === "<span class=\"cf0\">Pez León</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/MilagroPérez-Pez León.JPG", hotspot.title, hotspot.text);
  });
}

// Hebelia Morales
if (hotspot.title === "<span class=\"cf0\">Hebelia</span><span class=\"cf0\"> Morales</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/HebeliaMorales.jpg", hotspot.title, hotspot.text);
  });
}

// Hebelia Morales-Calas Blancas
if (hotspot.title === "<span class=\"cf0\">Calas Blancas</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/HebeliaMorales-Calas Blancas-b.jpg", hotspot.title, hotspot.text);
  });
}

// Hebelia Morales-Calas Rojas y Verdes
if (hotspot.title === "<span class=\"cf0\">Calas Rojas y Verdes</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/HebeliaMorales-Calas Rojas y Verdes-b.jpg", hotspot.title, hotspot.text);
  });
}

// Sylvia Godfrey
if (hotspot.title === "<span class=\"cf0\">Sylvia</span><span class=\"cf0\"> Godfrey</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/SilviaGodfrey.jpg", hotspot.title, hotspot.text);
  });
}

// Sylvia Godfrey-Creación
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">Creación</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/Creación.JPG", hotspot.title, hotspot.text);
  });
}

// Sylvia Godfrey-Amor
if (hotspot.title === "<span class=\"cf0\">Amor</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/SilviaGodfrey-Amor.jpg", hotspot.title, hotspot.text);
  });
}

// Sylvia Godfrey-Despertar
if (hotspot.title === "<p class=\"pf0\"><span class=\"cf0\">Despertar</span></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/SilviaGodfrey-Despertar.jpg", hotspot.title, hotspot.text);
  });
}

// Judy Moraga
if (hotspot.title === "<span class=\"cf0\">Judy Moraga</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/JudyMoraga.jpg", hotspot.title, hotspot.text);
  });
}

// Judy Moraga-Sueño de Orquideas
if (hotspot.title === "<span class=\"cf0\">Sueño de Orquideas</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/JudyMoraga-SUEÑO DE ORQUIDEAS.jpg", hotspot.title, hotspot.text);
  });
}

// Judy Moraga-Magia Negra
if (hotspot.title === "<span class=\"cf0\">Magia Negra</span>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/Ala-4/JudyMoraga-Magia Negra.jpg", hotspot.title, hotspot.text);
  });
}

// Jardin Esculturas
// El vuelo de las Monarcas
if (hotspot.title === "<strong></strong><p><strong>El vuelo de las Monarcas</strong></p>") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/ElVueloDeLasMonarcas.jpg", hotspot.title, hotspot.text);
  });
}

// Museo Virtual de la Acuarela - Exposición de la AVA
if (hotspot.title === "Museo Virtual de la Acuarela - Exposición de la AVA") {
  wrapper.querySelector('.info-hotspot-header').addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup("Imagenes/IMG-20251106-WA0017.jpg", hotspot.title, hotspot.text);
  });
}





    // Mostrar título al pasar el mouse → ya lo hace el tooltip por defecto

// Al hacer click en el header → abrir popup con imagen + texto
if (hotspot.image) {
  header.addEventListener('click', function(e) {
    e.stopPropagation();
    openPopup(hotspot.image, hotspot.title, hotspot.text);
  });
}

// Al hacer click en el ✕ → cerrar popup
modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', function(e) {
  e.stopPropagation();
  document.getElementById("popupOverlay").style.display = "none";
  // No tocar viewer ni usar visorActivo
});

// Evitar propagación de eventos
stopTouchAndScrollEventPropagation(wrapper);

return wrapper;

// === NUEVO BLOQUE MODULAR ===
// Fecha: 2025-11-20
// Función: Activa visor curatorial si el infoHotspot contiene campo "image" en data.js
// Uso: Permite abrir imagen + texto curatorial desde data.js sin codificación adicional
// Autor: Diego Peñalver Denis (con Copilot)
// --------------------------------------------

if (hotspot.image) {
  header.addEventListener('click', function(e) {
    // Si el visor está activo, no abrirlo de nuevo
    if (window.visorActivo) return;

    // Si el header está bloqueado, no hacer nada
    if (header.classList.contains('bloqueado')) return;

    e.stopPropagation();
    openPopup(hotspot.image, hotspot.title, hotspot.text);
  });
}

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Display the initial scene.
  switchScene(scenes[0]);

// Paneo por arrastre sobre la imagen ampliada
const overlay = document.getElementById('popupOverlay');
const body = document.getElementById('popupBody');
const img = document.getElementById('popupImage');

// Evita que Marzipano capture la rueda del mouse cuando el overlay está abierto
overlay.addEventListener('wheel', function(e) {
  e.stopPropagation();
}, { passive: false });

let dragging = false;
let startX = 0;
let startY = 0;
let startScrollLeft = 0;
let startScrollTop = 0;

img.addEventListener('mousedown', function(e) {
  if (!img.classList.contains('zoomed')) return;
  dragging = true;
  img.style.cursor = 'grabbing';
  startX = e.pageX;
  startY = e.pageY;
  startScrollLeft = body.scrollLeft;
  startScrollTop = body.scrollTop;
  e.preventDefault(); // evita selección de texto
});

window.addEventListener('mousemove', function(e) {
  if (!dragging) return;
  body.scrollLeft = startScrollLeft - (e.pageX - startX);
  body.scrollTop  = startScrollTop  - (e.pageY - startY);
});

window.addEventListener('mouseup', function() {
  dragging = false;
  if (img.classList.contains('zoomed')) {
    img.style.cursor = 'grab';
  }
});

// Reset suave al salir del zoom o cerrar
function resetZoomPan() {
  img.classList.remove('zoomed');
  img.style.cursor = 'zoom-in';
  body.scrollLeft = 0;
  body.scrollTop = 0;
}

// Integra el reset al cerrar (si ya tienes el botón ✕ y el click en overlay)
document.getElementById('popupClose').addEventListener('click', function() {
  resetZoomPan();
});
overlay.addEventListener('click', function(e) {
  if (e.target.id === 'popupOverlay') {
    resetZoomPan();
  }
});

})();
