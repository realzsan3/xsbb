var {
    Query
} = AV;
AV.init({
    appId: "91UroQk3R6xRP5p6CD7bfDJm-MdYXbMMI", 
    appKey: "qxxUH8hJtxNcKYQbOfS6K9Ox", 
    serverURLs: 'https://lecloudapi.919333.xyz'
});

//设定存储数据的 className
var query = new AV.Query('content');

var app = new Vue({
    el: '#app', data: {
        page: 0,
        count: 0,
        contents: []
    },
    methods: {
        loadMore: function (event) {
            getData(++this.page);
        }
    }
})

//识别 URL 链接
function urlToLink(str) {
    var re = /(http|ftp|https):\/\/[\w-]+(.[\w-]+)+([\w-.,@?^=%&:/~+#]*[\w-\@?^=%&/~+#])?/g;;

    str = str.replace(re, function (website) {
        return "<a href='" + website +
            "' target='_blank'> <i class='iconfont icon-lianjie-copy'></i>链接 </a>";
    });
    return str;
}


//获取数据
function getData(page = 0) {
    query.descending('createdAt').skip(page * 20).limit(20).find().then(function (results) {
        if (results.length == 0) {
            alert('之前没哔哔过了')
        } else {
            let resC = results;
            reqData = false;
            resC.forEach((i) => {
                let dateTmp = new Date(i.createdAt);
                i.attributes.time =
                    `${dateTmp.getFullYear()}-${(dateTmp.getMonth() + 1) < 10 ? ('0' + (dateTmp.getMonth()+1)) : dateTmp.getMonth()+1}-${(dateTmp.getDate() + 1) < 10 ? ('0' + dateTmp.getDate()) : dateTmp.getDate()} ${(dateTmp.getHours() + 1) <= 10 ? ('0' + dateTmp.getHours()) : dateTmp.getHours()}:${(dateTmp.getMinutes() + 1) <= 10 ? ('0' + dateTmp.getMinutes()) : dateTmp.getMinutes()}`;
                i.attributes.content = "<content>" + urlToLink(i.attributes.content) + "</content>";
                app.contents.push(i);
            })
        }

    }, function (error) {});
}

getData(0);

//计数
query.count().then(function (count) {
    app.count = count;
}, function (error) {});