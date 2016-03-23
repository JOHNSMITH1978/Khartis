import Ember from 'ember';
import Project from 'mapp/models/project'; 

export default Ember.Route.extend({
  
  controllerName: "graph",
  
  renderTemplate: function() {
    this.render("graph", { outlet: 'main' });
    this.render('graph.layer', {into: "graph", outlet: 'configuration-panel' });
  },
  
  model(params) {
    let layer = this.modelFor('graph').get('graphLayers').find( gl => gl.get('_uuid') === params.layerId);
    if (layer) {
      return layer;
    } else {
      this.transitionTo('graph');
    }
  },
  
  setupController(controller, model) {
    console.log("setupController");
    controller.set('editedLayer', model);
  },
  
  deactivate() {
    this.set('controller.editedLayer', null);
  },
  
  actions: {
    selectVisualization(type) {
      this.get('controller').send('bindLayerMapping', type);
      Ember.run.later(this, () => {
        this.transitionTo('graph.layer.edit');
      });
    }
  }
  
});