import Ember from 'ember';
import d3 from 'npm:d3';
import d3lper from 'khartis/utils/d3lper';
import {isChrome} from 'khartis/utils/browser-check';
import zoom2 from 'khartis/utils/d3-zoom2';

let zoom;
export default Ember.Mixin.create({


  zoomInit(d3g) {

    zoom = zoom2()
      .scaleExtent([1, 12])
      .band(0.5)
      .on("zoom", this.zoomAndDrag.bind(this))
      .scale(this.get('graphLayout.zoom'));
    
    this.updateTxTy(this.get('relTx'), this.get('relTy'));
    d3g.call(zoom);

  },

  updateTxTy(relTx, relTy) {
    zoom.translate([
      relTx,
      relTy
    ]);
  },

  relTx: Ember.computed('graphLayout.tx', '$width', {
    get() {
      return this.get('graphLayout.tx')*this.getSize().w;
    },
    set(k, v) {
      this.set('graphLayout.tx', v/this.getSize().w);
      return v;
    }
  }),

  relTy: Ember.computed('graphLayout.ty', '$height', {
    get() {
      return this.get('graphLayout.ty')*this.getSize().h;
    },
    set(k, v) {
      this.set('graphLayout.ty', v/this.getSize().h);
      return v;
    }
  }),

  zoomAndDrag(scale, translate) {

    let mapG = this.d3l().select("g.map"),
        projector = this.get('projector'),
        t = projector.initialTranslate,
        ds = projector.scale() / projector.resolution,
        rs = scale/ds,
        tx = projector.translate()[0]*rs - t[0] * scale,
        ty = projector.translate()[1]*rs - t[1] * scale;
        
    mapG.node().__kis_tx = translate[0];
    mapG.node().__kis_ty = translate[1];
    mapG.node().__kis_s = scale;
    mapG
      .transition()
      .duration(120)
      .ease(d3.easeLinear)
      .on("start", () => {
        this.get('refreshDebouncer') && Ember.run.cancel(this.get('refreshDebouncer'));
      })
      .on("end", () => {
        this.set('refreshDebouncer', Ember.run.debounce(this, this.refreshMap, 360));
      })
      .attrs({
        "transform": `${d3lper.translate({tx: translate[0] - tx, ty: translate[1] - ty})} scale(${rs})`
      });
    
    /*if (isChrome()) { //désactivé car marche mal
      mapG.selectAll("#layers .shape").each(function() {
        
        let el = d3.select(this),
          elBox = el.node().getBBox(),
          cx = elBox.x + elBox.width / 2,
          cy = elBox.y + elBox.height / 2;
      
        el.attr("transform", `${d3lper.translate({tx: -cx*(1/rs-1), ty: -cy*(1/rs-1)})} scale(${1/rs})`);
        
      });
    }*/
    
    
  },

  refreshDebouncer: null,
  refreshMap() {
    let mapG = this.d3l().select("g.map"),
        mapGNode = mapG.node();
    this.get('graphLayout').beginPropertyChanges();

    this.setProperties({
      "graphLayout.zoom": mapGNode.__kis_s,
      relTx: mapGNode.__kis_tx,
      relTy: mapGNode.__kis_ty
    });

    this.scaleProjector(this.get('projector'));
    this.get('graphLayout').endPropertyChanges();
    this.projectAndDraw();
    mapG.attr("transform", null);
  },
  
  zoomAndDragChange: function() {

    this.updateTxTy(this.get('relTx'), this.get('relTy'));

    let projector = this.get('projector'),
        ds = projector.scale() / projector.resolution,
        tx = projector.translate()[0] - projector.initialTranslate[0]*ds,
        ty = projector.translate()[1] - projector.initialTranslate[1]*ds,
        shiftX = tx - this.get('relTx'),
        shiftY = ty - this.get('relTy');

    if (Math.abs(ds - this.get('graphLayout.zoom')) > 0.1 
        || Math.abs(shiftX) > 0.1 || Math.abs(shiftY) > 0.1) {
      
      let {w, h} = this.getSize(),
		      vOf = this.get('graphLayout').vOffset(h),
          hOf = this.get('graphLayout').hOffset(w),
          m = this.get('graphLayout.margin');
       
      if (Math.abs(shiftX) <= 0.1 && Math.abs(shiftY) <= 0.1) {
        zoom.toPoint(
          this.get('graphLayout.zoom'),
          (w - m.get('h')) / 2 + m.l,
          (h - m.get('v')) / 2 + m.t
        );
      } else {
        zoom.toScaleAndTranslate(
          this.get('graphLayout.zoom'),
          this.get('relTx'),
          this.get('relTy')
        );
      }
      
    }

  }.observes('graphLayout.zoom', 'graphLayout.tx', 'graphLayout.ty', '$width', '$height')

});
