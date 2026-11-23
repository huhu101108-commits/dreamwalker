using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using static Dreamwalker.Demo.StudioArenaProtocol;

public static class OnlineMatch
{
    private static readonly JsonSerializerOptions Wire = new JsonSerializerOptions { IncludeFields=true };
    private static async Task<T> Call<T>(HttpClient client,string path,Command command=null)
    {
        using var request=new HttpRequestMessage(command==null ? HttpMethod.Get : HttpMethod.Post,path);
        if (command!=null) request.Content=new StringContent(JsonSerializer.Serialize(command,Wire),Encoding.UTF8,"application/json");
        using var response=await client.SendAsync(request);
        string body=await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new Exception(path+" returned "+(int)response.StatusCode+" "+body);
        return JsonSerializer.Deserialize<T>(body,Wire);
    }
    public static async Task Run(string origin,string code)
    {
        // The browser runner owns this isolated Worker and database.
        var endpoint=new Uri(origin+"/api/arena/");
        if (!endpoint.IsLoopback) throw new Exception("This fixture needs a loopback Worker.");
        using var client=new HttpClient(new HttpClientHandler { UseCookies=false }) { BaseAddress=endpoint,Timeout=TimeSpan.FromSeconds(8) };
        var status=await Call<Reply>(client,"status");
        if (status.protocol!=1 || status.actors.Length==0) throw new Exception("Online protocol");
        var login=await Call<Reply>(client,"session",new Command { native=true });
        if (string.IsNullOrEmpty(login.token)) throw new Exception("Missing native guest token");
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.token);
        var room=await Call<Snapshot>(client,"join",new Command { code=code });
        if (room.code!=code || room.seat!=1 || room.hz!=60 || room.players.Length!=2) throw new Exception("Seat or rules");

        using var resumed=new HttpClient(new HttpClientHandler { UseCookies=false }) { BaseAddress=endpoint,Timeout=TimeSpan.FromSeconds(8) };
        resumed.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.token);
        var me=await Call<Reply>(resumed,"me");
        if (me.room.code!=room.code || me.room.release!=room.release) throw new Exception("Guest reconnection");
        room=await Call<Snapshot>(resumed,"input",new Command { code=code,seq=1,press=1 });
        for (int i=0; i<55 && room.status!="finished"; i++) {
            await Task.Delay(100);
            room=await Call<Snapshot>(resumed,"room",new Command { code=code });
        }
        if (room.reason!="ko" || room.winner!=1 || room.players[0].hp!=0 || room.players[1].seq!=1)
            throw new Exception("Server verdict");
        var balance=await Call<Reply>(resumed,"market");
        if (balance.wallet.credits!=10 || balance.wallet.medals!=1) throw new Exception("Winner reward");
        Console.WriteLine("PASS Unity wire DTOs over HTTP against a live browser opponent, token resume, KO and balance");
    }
}
