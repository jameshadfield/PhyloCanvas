$(function(){!function(){window.WGST.exports.mapOverlayTypeToTemplateId={feedback:"feedback-overlay"},window.WGST.exports.createOverlay=function(e,t){if(!($('.wgst-overlay[data-overlay-id="'+e+'"]').length>0)){"undefined"==typeof t&&(t={});var a=window.WGST.exports.mapOverlayTypeToTemplateId[e],o=$('.wgst-template[data-template-id="'+a+'"]').html(),n=Handlebars.compile(o),l=n(t);$(".wgst-page__app").prepend(l)}},window.WGST.exports.removeOverlay=function(e){$('.wgst-overlay[data-overlay-id="'+e+'"]').remove()},$("body").on("click",".wgst-close-overlay",function(e){var t=$(this).closest(".wgst-overlay").attr("data-overlay-id");window.WGST.exports.removeOverlay(t),e.preventDefault()}),window.WGST.exports.showOverlay=function(e){$('.wgst-overlay[data-overlay-id="'+e+'"]').removeClass("hide-this invisible-this")},window.WGST.exports.hidePanel=function(e){$('.wgst-panel[data-panel-id="'+e+'"]').addClass("hide-this")},window.WGST.exports.bringPanelToTop=function(e){var t=0;$(".wgst-panel").each(function(){var e=parseInt($(this).css("zIndex"),10);e>t&&(t=e)}),$('[data-panel-id="'+e+'"]').css("zIndex",t+1)},$("body").on("click",".wgst-panel-control-button__close",function(){var e=$(this).closest(".wgst-panel"),t=e.attr("data-panel-id");window.WGST.exports.hidePanel(t)}),$("body").on("mousedown",".wgst-panel",function(){window.WGST.exports.bringPanelToTop($(this).attr("data-panel-id"))}),$("body").on("click",".wgst-panel-control-button__maximize",function(){var e=$(".wgst-fullscreen"),t=e.attr("data-fullscreen-id"),a=t;window.WGST.exports.bringFullscreenToPanel(t,a);var o=$(this).closest(".wgst-panel"),a=o.attr("data-panel-id"),t=a;window.WGST.exports.bringPanelToFullscreen(a,t)})}()});